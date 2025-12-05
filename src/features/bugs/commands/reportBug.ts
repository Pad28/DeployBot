import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import prisma from '../../../core/database/client';
import { Command } from '../../configuration/commands/index';
import logger from '../../../shared/utils/logger';
import { BugStatus, BugPriority } from '../../../core/types';

export const reportBugCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('report-bug')
        .setDescription('Reporta un bug')
        .addStringOption((option) =>
            option
                .setName('titulo')
                .setDescription('Título del bug')
                .setRequired(true)
                .setMaxLength(200)
        )
        .addStringOption((option) =>
            option
                .setName('descripcion')
                .setDescription('Descripción detallada del bug')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addStringOption((option) =>
            option
                .setName('prioridad')
                .setDescription('Prioridad del bug')
                .setRequired(false)
                .addChoices(
                    { name: 'Baja', value: BugPriority.LOW },
                    { name: 'Media', value: BugPriority.MEDIUM },
                    { name: 'Alta', value: BugPriority.HIGH },
                    { name: 'Crítica', value: BugPriority.CRITICAL }
                )
        )
        .addStringOption((option) =>
            option
                .setName('repositorio')
                .setDescription('Repositorio relacionado (opcional)')
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const titulo = interaction.options.getString('titulo', true);
        const descripcion = interaction.options.getString('descripcion', true);
        const prioridad = (interaction.options.getString('prioridad') as BugPriority) || BugPriority.MEDIUM;
        const repositorio = interaction.options.getString('repositorio');

        try {
            const reporter = interaction.user;

            // Verificar si el repositorio existe (si se proporcionó)
            let repoId: string | undefined;
            if (repositorio) {
                const repo = await prisma.repository.findUnique({
                    where: { name: repositorio },
                });
                if (!repo) {
                    await interaction.editReply(
                        `❌ Repositorio "${repositorio}" no encontrado`
                    );
                    return;
                }
                repoId = repo.id;
            }

            // Crear el bug
            const bug = await prisma.bug.create({
                data: {
                    title: titulo,
                    description: descripcion,
                    reporterId: reporter.id,
                    reporterTag: reporter.tag,
                    priority: prioridad,
                    repository: repositorio || null,
                    status: BugStatus.OPEN,
                },
            });

            const embed = new EmbedBuilder()
                .setTitle('🐛 Bug Reportado')
                .setDescription(`**${titulo}**`)
                .addFields(
                    {
                        name: '📝 Descripción',
                        value: descripcion.substring(0, 1024),
                        inline: false,
                    },
                    {
                        name: '🔢 ID',
                        value: bug.id,
                        inline: true,
                    },
                    {
                        name: '⚡ Prioridad',
                        value: prioridad,
                        inline: true,
                    },
                    {
                        name: '👤 Reportado por',
                        value: reporter.tag,
                        inline: true,
                    }
                )
                .setColor(0xff9900)
                .setTimestamp();

            if (repositorio) {
                embed.addFields({
                    name: '📦 Repositorio',
                    value: repositorio,
                    inline: true,
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error reportando bug:', error);
            await interaction.editReply('❌ Error al reportar el bug');
        }
    },

    async autocomplete(interaction: any) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'repositorio') {
            try {
                const repos = await prisma.repository.findMany({
                    where: { isActive: true },
                    take: 25,
                });

                const filtered = repos
                    .filter((repo) =>
                        repo.name
                            .toLowerCase()
                            .includes(focusedOption.value.toLowerCase())
                    )
                    .map((repo) => ({
                        name: repo.name,
                        value: repo.name,
                    }));

                await interaction.respond(filtered);
            } catch (error) {
                logger.error('Error en autocomplete de repos:', error);
                await interaction.respond([]);
            }
        }
    },
};

