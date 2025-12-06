import { exec } from 'child_process';
import { promisify } from 'util';
import { Repository, Deployment } from '@prisma/client';
import { BranchConfig, DeploymentStatus } from '../../core/types';
import prisma from '../../core/database/client';
import logger from '../../shared/utils/logger';
import { env } from '../../shared/config/env';
import { sendNotification } from '../notifications/discord';
import simpleGit from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface CommitInfo {
    id: string;
    message: string;
    author: {
        name: string;
        email: string;
    };
}

export async function processDeployment(
    deploymentId: string,
    repo: Repository,
    branchConfig: BranchConfig,
    commit: CommitInfo
) {
    let deployment: Deployment | null = null;

    try {
        deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
        });

        if (!deployment) {
            throw new Error('Deployment no encontrado');
        }

        // Actualizar estado a BUILDING
        await prisma.deployment.update({
            where: { id: deploymentId },
            data: { status: DeploymentStatus.BUILDING },
        });

        // Clonar/actualizar repositorio
        const deployPath = path.join(env.DEPLOY_BASE_PATH, repo.id, branchConfig.branch);

        const git = simpleGit();

        // Verificar si el directorio existe y es un repo git válido
        let isGitRepo = false;
        try {
            const gitInPath = simpleGit(deployPath);
            await gitInPath.status();
            isGitRepo = true;
        } catch {
            // No es un repo git válido, eliminar si existe
            try {
                await fs.rm(deployPath, { recursive: true, force: true });
            } catch {
                // Ignorar errores al eliminar
            }
        }

        // Preparar URL con autenticación si hay token disponible
        let authenticatedUrl = repo.gitUrl;
        if (repo.provider === 'GITHUB' && env.GITHUB_TOKEN) {
            // Si ya tiene token, no agregarlo de nuevo
            if (!repo.gitUrl.includes(env.GITHUB_TOKEN)) {
                authenticatedUrl = repo.gitUrl.replace(
                    /^https:\/\/(?:.*@)?(github\.com\/)/,
                    `https://${env.GITHUB_TOKEN}@$1`
                );
            }
        } else if (repo.provider === 'GITLAB' && env.GITLAB_TOKEN) {
            // Si ya tiene token, no agregarlo de nuevo
            if (!repo.gitUrl.includes(env.GITLAB_TOKEN)) {
                authenticatedUrl = repo.gitUrl.replace(
                    /^https:\/\/(?:oauth2:.*@)?(gitlab\.com\/|.*@gitlab\.com\/)/,
                    `https://oauth2:${env.GITLAB_TOKEN}@$1`
                );
            }
        }

        // Verificar que la rama existe en el remoto usando ls-remote (más confiable)
        // Esto evita intentar clonar/checkout una rama que no existe
        let remoteBranches: string[] = [];
        try {
            const lsRemoteResult = await git.listRemote(['--heads', authenticatedUrl]);

            if (!lsRemoteResult || !lsRemoteResult.trim()) {
                throw new Error('No se recibieron ramas del repositorio remoto');
            }

            remoteBranches = lsRemoteResult
                .split('\n')
                .filter((line: string) => line.trim())
                .map((line: string) => {
                    // Formato: <hash>    refs/heads/<branch-name> o <hash>\trefs/heads/<branch-name>
                    const match = line.match(/refs\/heads\/(.+)$/);
                    return match ? match[1] : null;
                })
                .filter((branch: string | null): branch is string => branch !== null);

            if (remoteBranches.length === 0) {
                throw new Error('No se encontraron ramas en el repositorio remoto');
            }

            if (!remoteBranches.includes(branchConfig.branch)) {
                const availableBranches = remoteBranches.join(', ');
                throw new Error(
                    `La rama "${branchConfig.branch}" no existe en el repositorio remoto. ` +
                    `Ramas disponibles: ${availableBranches}`
                );
            }
        } catch (verifyError: any) {
            // Si el error ya tiene mensaje sobre ramas disponibles, re-lanzarlo
            if (verifyError.message.includes('Ramas disponibles')) {
                logger.error(`Rama no encontrada: ${verifyError.message}`);
                throw verifyError;
            }
            // Si es otro error (acceso denegado, repo no existe, etc.), proporcionar mensaje útil
            logger.error(`Error verificando ramas remotas para ${repo.name} (${repo.gitUrl}): ${verifyError.message}`);

            // Detectar errores comunes y proporcionar mensajes más específicos
            const errorMsg = verifyError.message?.toLowerCase() || '';
            if (errorMsg.includes('authentication') || errorMsg.includes('permission')) {
                throw new Error(
                    `Error de autenticación al acceder al repositorio. ` +
                    `Verifica que el token (${repo.provider === 'GITHUB' ? 'GITHUB_TOKEN' : 'GITLAB_TOKEN'}) ` +
                    `tenga permisos para acceder a este repositorio.`
                );
            } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
                throw new Error(
                    `Repositorio no encontrado o no accesible: ${repo.gitUrl}. ` +
                    `Verifica que la URL sea correcta y que tengas acceso al repositorio.`
                );
            }

            throw new Error(
                `No se pudo verificar las ramas remotas. Error: ${verifyError.message}. ` +
                `Verifica que el repositorio sea accesible y que tengas los permisos necesarios.`
            );
        }

        if (isGitRepo) {
            // Repositorio ya existe, actualizar
            const gitInPath = simpleGit(deployPath);

            // Actualizar remote si la URL cambió (p. ej., se agregó token)
            try {
                const currentRemoteUrl = await gitInPath.getRemotes(true);
                const hasOrigin = currentRemoteUrl.some((r: any) => r.name === 'origin');

                if (!hasOrigin || currentRemoteUrl.find((r: any) => r.name === 'origin')?.refs?.fetch !== authenticatedUrl) {
                    if (hasOrigin) {
                        await gitInPath.removeRemote('origin');
                    }
                    await gitInPath.addRemote('origin', authenticatedUrl);
                }
            } catch (remoteError: any) {
                // Continuar - podría funcionar aún si el remote está configurado
            }

            // Fetch para obtener las últimas referencias
            try {
                await gitInPath.fetch('origin', ['--prune']);
            } catch (fetchError: any) {
                logger.error(`Error en fetch para ${repo.name}: ${fetchError.message}`);
                throw new Error(
                    `No se pudo actualizar el repositorio. Error en fetch: ${fetchError.message}. ` +
                    `Verifica la conexión y los permisos de acceso.`
                );
            }

            // Checkout y pull de la rama
            try {
                // Verificar si la rama local existe
                const branches = await gitInPath.branchLocal();
                const branchExists = branches.all.includes(branchConfig.branch);

                if (branchExists) {
                    // Cambiar a la rama existente
                    await gitInPath.checkout(branchConfig.branch);
                    // Asegurar que esté tracking el remoto correcto
                    await gitInPath.branch(['--set-upstream-to', `origin/${branchConfig.branch}`, branchConfig.branch]).catch(() => {
                        // Ignorar si ya está configurado
                    });
                } else {
                    // Crear rama local tracking la remota
                    await gitInPath.checkout(['-b', branchConfig.branch, `origin/${branchConfig.branch}`]);
                }

                // Pull para obtener los últimos cambios
                await gitInPath.pull('origin', branchConfig.branch, ['--ff-only']);
            } catch (checkoutError: any) {
                logger.error(`Error en checkout/pull para ${repo.name}/${branchConfig.branch}: ${checkoutError.message}`);
                throw new Error(
                    `No se pudo cambiar a la rama "${branchConfig.branch}". Error: ${checkoutError.message}. ` +
                    `Asegúrate de que la rama existe en el remoto.`
                );
            }
        } else {
            // Clonar repositorio nuevo
            try {
                await fs.mkdir(path.dirname(deployPath), { recursive: true });
                await git.clone(authenticatedUrl, deployPath, ['-b', branchConfig.branch, '--depth', '1']);
            } catch (cloneError: any) {
                logger.error(`Error clonando ${repo.name}: ${cloneError.message}`);
                // Limpiar directorio parcial si existe
                try {
                    await fs.rm(deployPath, { recursive: true, force: true });
                } catch {
                    // Ignorar errores de limpieza
                }
                throw new Error(
                    `No se pudo clonar el repositorio. Error: ${cloneError.message}. ` +
                    `Verifica que la URL sea correcta y que tengas acceso al repositorio.`
                );
            }
        }

        // Ejecutar build si está configurado
        let buildLog = '';
        if (branchConfig.buildCommand) {
            const { stdout, stderr } = await execAsync(branchConfig.buildCommand, {
                cwd: deployPath,
                env: { ...process.env, NODE_ENV: branchConfig.environment },
            });
            buildLog = stdout + stderr;
        }

        // Actualizar estado a DEPLOYING
        await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
                status: DeploymentStatus.DEPLOYING,
                buildLog,
            },
        });

        // Ejecutar deploy si está configurado
        let deployLog = '';
        if (branchConfig.deployCommand) {
            const { stdout, stderr } = await execAsync(branchConfig.deployCommand, {
                cwd: deployPath,
                env: { ...process.env, NODE_ENV: branchConfig.environment },
            });
            deployLog = stdout + stderr;
        }

        // Actualizar estado a SUCCESS
        await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
                status: DeploymentStatus.SUCCESS,
                deployLog,
                completedAt: new Date(),
            },
        });

        // Enviar notificación
        await sendNotification(
            branchConfig.discordChannelId,
            repo,
            branchConfig,
            commit,
            DeploymentStatus.SUCCESS,
            deploymentId
        );
    } catch (error: any) {
        logger.error(`❌ Error en deployment ${deploymentId}:`, error);

        if (deployment) {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    status: DeploymentStatus.FAILED,
                    error: error.message || String(error),
                    completedAt: new Date(),
                },
            });

            // Enviar notificación de error
            await sendNotification(
                branchConfig.discordChannelId,
                repo,
                branchConfig,
                commit,
                DeploymentStatus.FAILED,
                deploymentId,
                error.message
            );
        }
    }
}

