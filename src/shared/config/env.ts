import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    DISCORD_BOT_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    PORT: z.string().default('3000'),
    WEBHOOK_SECRET: z.string().optional(),
    DEPLOY_BASE_PATH: z.string().default('/tmp/deployments'),
    GITHUB_TOKEN: z.string().optional(),
    GITLAB_TOKEN: z.string().optional(),
    NODE_ENV: z.enum(['development', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
    env = envSchema.parse(process.env);
} catch (error) {
    console.error('❌ Error en variables de entorno:', error);
    process.exit(1);
}

export { env };

