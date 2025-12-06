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
            // Reemplazar https://github.com/ con token
            authenticatedUrl = repo.gitUrl.replace(
                /^https:\/\/(github\.com\/)/,
                `https://${env.GITHUB_TOKEN}@$1`
            );
        } else if (repo.provider === 'GITLAB' && env.GITLAB_TOKEN) {
            // Reemplazar https:// con token para GitLab
            authenticatedUrl = repo.gitUrl.replace(
                /^https:\/\/(gitlab\.com\/|.*@gitlab\.com\/)/,
                `https://oauth2:${env.GITLAB_TOKEN}@$1`
            );
        }

        // Verificar que la rama existe en el remoto usando ls-remote (más confiable)
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
                    // Formato: <hash>    refs/heads/<branch-name>
                    const match = line.match(/refs\/heads\/(.+)$/);
                    return match ? match[1] : null;
                })
                .filter((branch: string | null): branch is string => branch !== null);

            logger.info(`Ramas remotas encontradas: ${remoteBranches.join(', ')}`);

            if (!remoteBranches.includes(branchConfig.branch)) {
                throw new Error(
                    `La rama "${branchConfig.branch}" no existe en el repositorio remoto. ` +
                    `Ramas disponibles: ${remoteBranches.join(', ')}`
                );
            }
        } catch (verifyError: any) {
            // Si el error ya tiene mensaje sobre ramas disponibles, re-lanzarlo
            if (verifyError.message.includes('Ramas disponibles')) {
                logger.error(`Error verificando ramas remotas: ${verifyError.message}`);
                throw verifyError;
            }
            // Si es otro error, loguear el error completo y re-lanzarlo
            logger.error(`Error al verificar ramas remotas (URL: ${repo.gitUrl}): ${verifyError.message}`);
            throw new Error(
                `No se pudo verificar las ramas remotas. Error: ${verifyError.message}. ` +
                `Verifica que el repositorio sea accesible y que tengas los permisos necesarios.`
            );
        }

        if (isGitRepo) {
            // Ya existe, hacer checkout y pull
            const gitInPath = simpleGit(deployPath);

            // Si la URL cambió (se agregó token), actualizar el remote
            if (authenticatedUrl !== repo.gitUrl) {
                await gitInPath.removeRemote('origin').catch(() => { });
                await gitInPath.addRemote('origin', authenticatedUrl);
            }

            // Fetch para asegurar que tenemos las últimas referencias
            await gitInPath.fetch('origin').catch((err) => {
                logger.warn(`Error en fetch: ${err.message}`);
            });

            await gitInPath.checkout(branchConfig.branch).catch(async () => {
                // Si la rama local no existe, crear tracking branch
                await gitInPath.checkout(['-b', branchConfig.branch, `origin/${branchConfig.branch}`]);
            });

            await gitInPath.pull('origin', branchConfig.branch);
        } else {
            // Clonar en directorio limpio (ya verificamos que la rama existe arriba)
            await fs.mkdir(path.dirname(deployPath), { recursive: true });
            await git.clone(authenticatedUrl, deployPath, ['-b', branchConfig.branch]);
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

