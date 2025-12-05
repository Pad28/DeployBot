import { DiscordBot } from './core/discord/bot';
import { setBotInstance } from './core/discord/botInstance';
import { HttpServer } from './core/http/server';
import logger from './shared/utils/logger';
import prisma from './core/database/client';

async function main() {
    try {
        logger.info('🚀 Iniciando DeployBot...');

        // Inicializar base de datos
        await prisma.$connect();
        logger.info('✅ Base de datos conectada');

        // Inicializar bot de Discord
        const discordBot = new DiscordBot();
        setBotInstance(discordBot);
        await discordBot.initialize();

        // Inicializar servidor HTTP
        const httpServer = new HttpServer();
        await httpServer.start();

        logger.info('✅ Bot iniciado correctamente');

        // Manejar cierre graceful
        process.on('SIGINT', async () => {
            logger.info('🛑 Cerrando aplicación...');
            await prisma.$disconnect();
            discordBot.client.destroy();
            process.exit(0);
        });
    } catch (error) {
        logger.error('❌ Error fatal:', error);
        process.exit(1);
    }
}

main();
