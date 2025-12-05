import { Provider, DeploymentStatus, BugStatus, BugPriority } from '@prisma/client';

export type GitProvider = Provider;

export interface BranchConfig {
    branch: string;
    discordChannelId: string;
    prChannelId?: string; // Canal opcional para notificaciones de PRs
    buildCommand?: string;
    deployCommand?: string;
    environment?: string;
}

export interface WebhookPayload {
    ref: string;
    repository: {
        name: string;
        full_name: string;
        clone_url: string;
        html_url: string;
    };
    commits: Array<{
        id: string;
        message: string;
        author: {
            name: string;
            email: string;
        };
    }>;
    head_commit?: {
        id: string;
        message: string;
        author: {
            name: string;
            email: string;
        };
    };
}

export { Provider, DeploymentStatus, BugStatus, BugPriority };
