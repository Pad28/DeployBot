import { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } from 'discord.js';
import { env } from '../../shared/config/env';
import logger from '../../shared/utils/logger';
import { registerCommands } from '../../features/configuration/commands';

export class DiscordBot {
    public client: Client;
    private commands: Collection<string, any>;

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
            ],
        });
        this.commands = new Collection();
    }

    async initialize() {
        try {
            // Registrar comandos
            await this.registerSlashCommands();

            // Eventos
            this.client.once('ready', () => {
                logger.info(`✅ Bot conectado como ${this.client.user?.tag}`);
            });

            this.client.on('interactionCreate', async (interaction) => {
                if (interaction.isAutocomplete()) {
                    const command = this.commands.get(interaction.commandName);
                    if (command && command.autocomplete) {
                        try {
                            await command.autocomplete(interaction);
                        } catch (error) {
                            logger.error('Error en autocomplete:', error);
                        }
                    }
                    return;
                }

                if (!interaction.isChatInputCommand()) return;

                const command = this.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    await command.execute(interaction);
                } catch (error) {
                    logger.error('Error ejecutando comando:', error);
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({
                            content: '❌ Hubo un error al ejecutar este comando.',
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        await interaction.reply({
                            content: '❌ Hubo un error al ejecutar este comando.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }
            });

            await this.client.login(env.DISCORD_BOT_TOKEN);
        } catch (error) {
            logger.error('Error inicializando bot de Discord:', error);
            throw error;
        }
    }

    private async registerSlashCommands() {
        const commands = registerCommands();

        // Guardar comandos en colección
        commands.forEach((cmd) => {
            this.commands.set(cmd.data.name, cmd);
        });

        // Registrar comandos en Discord
        const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);

        try {
            await rest.put(
                Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
                { body: commands.map((cmd) => cmd.data.toJSON()) }
            );
        } catch (error) {
            logger.error('Error registrando comandos:', error);
        }
    }

    async getChannel(channelId: string) {
        return await this.client.channels.fetch(channelId);
    }
}

