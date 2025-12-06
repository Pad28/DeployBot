import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import prisma from '../../../core/database/client';
import { Command } from './index';
import logger from '../../../shared/utils/logger';
import { Provider } from '../../../core/types';
import { env } from '../../../shared/config/env';
import { requireAdminPermission } from '../../../shared/utils/permissions';

const addRepoBuilder = new SlashCommandBuilder()
    .setName('add-repo')
    .setDescription('Agrega un repositorio para monitorear')
    .addStringOption((option) =>
        option
            .setName('nombre')
            .setDescription('Nombre del repositorio (ej: mi-proyecto)')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('url')
            .setDescription('URL del repositorio Git (HTTPS)')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('provider')
            .setDescription('Proveedor Git')
            .setRequired(true)
            .addChoices(
                { name: 'GitHub', value: Provider.GITHUB },
                { name: 'GitLab', value: Provider.GITLAB }
            )
    );

export const addRepoCommand: Command = {
    data: addRepoBuilder,

    async execute(interaction: ChatInputCommandInteraction) {
        // Verificar permisos antes de defer
        if (!await requireAdminPermission(interaction)) {
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const nombre = interaction.options.getString('nombre', true);
        const gitUrl = interaction.options.getString('url', true);
        const provider = interaction.options.getString('provider', true) as Provider;

        try {
            // Validar URL
            try {
                new URL(gitUrl);
            } catch {
                await interaction.editReply('❌ URL inválida');
                return;
            }

            // Verificar si ya existe
            const existing = await prisma.repository.findUnique({
                where: { name: nombre },
            });

            if (existing) {
                await interaction.editReply(`❌ El repositorio "${nombre}" ya existe`);
                return;
            }

            // Crear repositorio
            // Usar WEBHOOK_SECRET de las variables de entorno si está disponible
            const repo = await prisma.repository.create({
                data: {
                    name: nombre,
                    gitUrl,
                    provider,
                    branches: [],
                    webhookSecret: env.WEBHOOK_SECRET || null,
                },
            });

            const embed = new EmbedBuilder()
                .setTitle('✅ Repositorio agregado')
                .setDescription(`**${nombre}**`)
                .addFields(
                    { name: 'URL', value: gitUrl, inline: false },
                    { name: 'Provider', value: provider, inline: true },
                    { name: 'ID', value: repo.id, inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error agregando repositorio:', error);
            await interaction.editReply('❌ Error al agregar el repositorio');
        }
    },
};

