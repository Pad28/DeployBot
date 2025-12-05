import express, { Express, Request, Response } from 'express';
import { env } from '../../shared/config/env';
import logger from '../../shared/utils/logger';
import { handleWebhook } from '../../features/webhooks/handler';
import { handlePullRequestWebhook } from '../../features/webhooks/pullRequestHandler';
import { Provider } from '../../core/types';

export class HttpServer {
  private app: Express;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes() {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.post('/webhook/github', async (req: Request, res: Response) => {
      try {
        // Detectar tipo de evento
        const eventType = req.headers['x-github-event'] as string;
        
        if (eventType === 'pull_request') {
          await handlePullRequestWebhook(req, Provider.GITHUB);
        } else if (eventType === 'push') {
          await handleWebhook(req, Provider.GITHUB);
        }
        
        res.status(200).json({ received: true });
      } catch (error) {
        logger.error('Error procesando webhook de GitHub:', error);
        res.status(500).json({ error: 'Error procesando webhook' });
      }
    });

    this.app.post('/webhook/gitlab', async (req: Request, res: Response) => {
      try {
        // Detectar tipo de evento
        const eventType = req.headers['x-gitlab-event'] as string;
        
        if (eventType === 'Merge Request Hook') {
          await handlePullRequestWebhook(req, Provider.GITLAB);
        } else if (eventType === 'Push Hook') {
          await handleWebhook(req, Provider.GITLAB);
        }
        
        res.status(200).json({ received: true });
      } catch (error) {
        logger.error('Error procesando webhook de GitLab:', error);
        res.status(500).json({ error: 'Error procesando webhook' });
      }
    });
  }

  async start() {
    const port = parseInt(env.PORT, 10);
    this.app.listen(port, () => {
      logger.info(`🚀 Servidor HTTP iniciado en puerto ${port}`);
    });
  }
}

