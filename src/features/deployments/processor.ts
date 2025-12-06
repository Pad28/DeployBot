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

        if (isGitRepo) {
            // Ya existe, hacer checkout y pull
            const gitInPath = simpleGit(deployPath);
            
            // Si la URL cambió (se agregó token), actualizar el remote
            if (authenticatedUrl !== repo.gitUrl) {
                await gitInPath.removeRemote('origin').catch(() => {});
                await gitInPath.addRemote('origin', authenticatedUrl);
            }
            
            // Obtener ramas remotas para verificar que existe
            try {
                await gitInPath.fetch('origin');
                const branches = await gitInPath.branch(['-r']);
                const branchExists = branches.all.some(
                    (b: string) => b.includes(`origin/${branchConfig.branch}`)
                );
                
                if (!branchExists) {
                    throw new Error(
                        `La rama "${branchConfig.branch}" no existe en el repositorio remoto. ` +
                        `Ramas disponibles: ${branches.all.filter((b: string) => b.includes('origin/')).join(', ')}`
                    );
                }
            } catch (fetchError: any) {
                // Si falla el fetch, intentar continuar pero podría fallar después
                logger.warn(`No se pudo verificar ramas remotas: ${fetchError.message}`);
            }
            
            await gitInPath.checkout(branchConfig.branch).catch(async () => {
                // Si la rama local no existe, crear tracking branch
                await gitInPath.checkout(['-b', branchConfig.branch, `origin/${branchConfig.branch}`]);
            });
            
            await gitInPath.pull('origin', branchConfig.branch);
        } else {
            // Clonar en directorio limpio
            await fs.mkdir(path.dirname(deployPath), { recursive: true });
            
            try {
                await git.clone(authenticatedUrl, deployPath, ['-b', branchConfig.branch]);
            } catch (cloneError: any) {
                if (cloneError.message?.includes('Remote branch') && cloneError.message?.includes('not found')) {
                    // Intentar clonar sin especificar la rama y luego hacer checkout
                    await git.clone(authenticatedUrl, deployPath);
                    const gitInPath = simpleGit(deployPath);
                    const branches = await gitInPath.branch(['-r']);
                    const branchExists = branches.all.some(
                        (b: string) => b.includes(`origin/${branchConfig.branch}`)
                    );
                    
                    if (!branchExists) {
                        throw new Error(
                            `La rama "${branchConfig.branch}" no existe en el repositorio remoto. ` +
                            `Ramas disponibles: ${branches.all.filter((b: string) => b.includes('origin/')).map((b: string) => b.replace('origin/', '')).join(', ')}`
                        );
                    }
                    
                    await gitInPath.checkout(['-b', branchConfig.branch, `origin/${branchConfig.branch}`]);
                } else {
                    throw cloneError;
                }
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

