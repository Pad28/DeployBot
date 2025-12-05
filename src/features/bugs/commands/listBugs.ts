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

export const listBugsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('list-bugs')
        .setDescription('Lista los bugs sin resolver')
        .addStringOption((option) =>
            option
                .setName('filtro')
                .setDescription('Filtrar por estado')
                .setRequired(false)
                .addChoices(
                    { name: 'Abiertos', value: BugStatus.OPEN },
                    { name: 'Resueltos', value: BugStatus.RESOLVED },
                    { name: 'Todos', value: 'ALL' }
                )
        )
        .addIntegerOption((option) =>
            option
                .setName('limite')
                .setDescription('Número máximo de bugs a mostrar (1-25)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const filtro = interaction.options.getString('filtro') || BugStatus.OPEN;
        const limite = interaction.options.getInteger('limite') || 10;

        try {
            const where: any = {};
            if (filtro !== 'ALL') {
                where.status = filtro as BugStatus;
            }

            const bugs = await prisma.bug.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limite,
            });

            if (bugs.length === 0) {
                await interaction.editReply(
                    `📭 No hay bugs ${filtro === 'ALL' ? '' : filtro === BugStatus.OPEN ? 'abiertos' : 'resueltos'}`
                );
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(
                    `🐛 Bugs ${filtro === 'ALL' ? '' : filtro === BugStatus.OPEN ? 'Abiertos' : 'Resueltos'}`
                )
                .setDescription(`Total: ${bugs.length}`)
                .setColor(filtro === BugStatus.OPEN ? 0xff9900 : 0x00ff00)
                .setTimestamp();

            bugs.forEach((bug, index) => {
                const statusEmoji = bug.status === BugStatus.OPEN ? '🔴' : '✅';
                const priorityEmoji =
                    bug.priority === BugPriority.CRITICAL
                        ? '🔴'
                        : bug.priority === BugPriority.HIGH
                            ? '🟠'
                            : bug.priority === BugPriority.MEDIUM
                                ? '🟡'
                                : '🟢';

                embed.addFields({
                    name: `${statusEmoji} ${bug.title}`,
                    value: [
                        `**ID:** \`${bug.id.substring(0, 8)}\``,
                        `**Prioridad:** ${priorityEmoji} ${bug.priority || 'N/A'}`,
                        `**Reportado por:** ${bug.reporterTag}`,
                        bug.repository
                            ? `**Repositorio:** ${bug.repository}`
                            : '',
                        `**Fecha:** <t:${Math.floor(bug.createdAt.getTime() / 1000)}:R>`,
                        bug.description.length > 100
                            ? `**Descripción:** ${bug.description.substring(0, 100)}...`
                            : `**Descripción:** ${bug.description}`,
                    ]
                        .filter(Boolean)
                        .join('\n'),
                    inline: false,
                });
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error listando bugs:', error);
            await interaction.editReply('❌ Error al listar los bugs');
        }
    },
};

