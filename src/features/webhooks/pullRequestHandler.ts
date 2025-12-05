import { Request } from 'express';
import { GitProvider } from '../../core/types';
import { PullRequestPayload, GitLabMergeRequestPayload } from '../../core/types/pullRequest';
import prisma from '../../core/database/client';
import logger from '../../shared/utils/logger';
import { sendPullRequestNotification, PRAction } from '../notifications/pullRequest';
import { BranchConfig } from '../../core/types';

export async function handlePullRequestWebhook(req: Request, provider: GitProvider) {
    try {
        if (provider === 'GITHUB') {
            const payload = req.body as PullRequestPayload;
            await handleGitHubPullRequest(payload);
        } else if (provider === 'GITLAB') {
            const payload = req.body as GitLabMergeRequestPayload;
            await handleGitLabMergeRequest(payload);
        }
    } catch (error) {
        logger.error('Error procesando webhook de Pull Request:', error);
        throw error;
    }
}

async function handleGitHubPullRequest(payload: PullRequestPayload) {
    const { action, pull_request, repository } = payload;

    // Solo procesar acciones relevantes
    const validActions: PRAction[] = ['opened', 'closed', 'reopened', 'synchronize', 'merged'];
    if (!validActions.includes(action as PRAction)) {
        return;
    }

    const prAction = action as PRAction;

    const baseBranch = pull_request.base.ref;
    const repositoryName = repository.name;

    // Buscar repositorio en la base de datos
    const repo = await prisma.repository.findFirst({
        where: {
            provider: 'GITHUB',
            isActive: true,
            OR: [
                { name: repositoryName },
                { gitUrl: { contains: repositoryName } },
            ],
        },
    });

    if (!repo) {
        logger.warn(`Repositorio no encontrado: ${repositoryName}`);
        return;
    }

    // Buscar configuración de la rama base
    const branches = (Array.isArray(repo.branches) ? (repo.branches as unknown as BranchConfig[]) : []) || [];
    const branchConfig = branches.find((b) => b.branch === baseBranch);

    if (!branchConfig) {
        return;
    }

    // Si no hay canal de PRs configurado, usar el canal de deployments
    const prChannelId = branchConfig.prChannelId || branchConfig.discordChannelId;

    if (!prChannelId) {
        logger.warn(`No hay canal configurado para PRs en ${repositoryName}/${baseBranch}`);
        return;
    }

    // Enviar notificación
    await sendPullRequestNotification(
        prChannelId,
        repo,
        {
            number: pull_request.number,
            title: pull_request.title,
            body: pull_request.body || '',
            state: pull_request.state,
            merged: pull_request.merged || false,
            url: pull_request.html_url,
            baseBranch: pull_request.base.ref,
            headBranch: pull_request.head.ref,
            author: pull_request.user.login,
            authorAvatar: pull_request.user.avatar_url,
            createdAt: pull_request.created_at,
            updatedAt: pull_request.updated_at,
            mergedAt: pull_request.merged_at,
        },
        prAction
    );
}

async function handleGitLabMergeRequest(payload: GitLabMergeRequestPayload) {
    const { object_attributes, project, user } = payload;

    const targetBranch = object_attributes.target_branch;
    const repositoryName = project.name;

    // Buscar repositorio en la base de datos
    const repo = await prisma.repository.findFirst({
        where: {
            provider: 'GITLAB',
            isActive: true,
            OR: [
                { name: repositoryName },
                { gitUrl: { contains: repositoryName } },
            ],
        },
    });

    if (!repo) {
        logger.warn(`Repositorio no encontrado: ${repositoryName}`);
        return;
    }

    // Buscar configuración de la rama target
    const branches = (Array.isArray(repo.branches) ? (repo.branches as unknown as BranchConfig[]) : []) || [];
    const branchConfig = branches.find((b) => b.branch === targetBranch);

    if (!branchConfig) {
        return;
    }

    // Si no hay canal de PRs configurado, usar el canal de deployments
    const prChannelId = branchConfig.prChannelId || branchConfig.discordChannelId;

    if (!prChannelId) {
        logger.warn(`No hay canal configurado para PRs en ${repositoryName}/${targetBranch}`);
        return;
    }

    // Determinar acción basada en el estado
    let action: PRAction = 'opened';
    if (object_attributes.merged) {
        action = 'merged';
    } else if (object_attributes.state === 'closed') {
        action = 'closed';
    }

    // Enviar notificación
    await sendPullRequestNotification(
        prChannelId,
        repo,
        {
            number: object_attributes.iid,
            title: object_attributes.title,
            body: object_attributes.description || '',
            state: object_attributes.state === 'merged' ? 'closed' : (object_attributes.state === 'opened' ? 'open' : 'closed'),
            merged: object_attributes.merged,
            url: object_attributes.url,
            baseBranch: object_attributes.target_branch,
            headBranch: object_attributes.source_branch,
            author: user.username,
            authorAvatar: user.avatar_url,
            createdAt: object_attributes.created_at,
            updatedAt: object_attributes.updated_at,
            mergedAt: object_attributes.merged_at,
        },
        action
    );
}

