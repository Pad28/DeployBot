import { Request } from 'express';
import { GitProvider, WebhookPayload, BranchConfig, DeploymentStatus } from '../../core/types';
import prisma from '../../core/database/client';
import logger from '../../shared/utils/logger';
import { processDeployment } from '../deployments/processor';

export async function handleWebhook(req: Request, provider: GitProvider) {
  const payload = req.body as WebhookPayload;

  // Extraer información del webhook
  const ref = payload.ref;
  const branch = ref.replace('refs/heads/', '');
  const repositoryName = payload.repository.name;

  // Buscar repositorio en la base de datos
  const repo = await prisma.repository.findFirst({
    where: {
      provider,
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

  // Verificar si la rama está configurada
  const branches = (Array.isArray(repo.branches) ? (repo.branches as unknown as BranchConfig[]) : []) || [];
  const branchConfig = branches.find((b) => b.branch === branch);

  if (!branchConfig) {
    return;
  }

  // Obtener información del commit
  const commit = payload.head_commit || payload.commits?.[0];
  if (!commit) {
    logger.warn('No se encontró información del commit');
    return;
  }

  // Crear registro de deployment
  const deployment = await prisma.deployment.create({
    data: {
      repositoryId: repo.id,
      branch,
      commit: commit.id,
      commitMessage: commit.message,
      author: commit.author.name,
      status: DeploymentStatus.PENDING,
    },
  });

  // Procesar deployment de forma asíncrona
  processDeployment(deployment.id, repo, branchConfig, commit).catch((error) => {
    logger.error('Error procesando deployment:', error);
  });
}

