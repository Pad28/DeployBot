import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import prisma from '../../../core/database/client';
import { Command } from '../../configuration/commands/index';
import logger from '../../../shared/utils/logger';
import { BugStatus } from '../../../core/types';

export const resolveBugCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('resolve-bug')
        .setDescription('Marca un bug como resuelto')
        .addStringOption((option) =>
            option
                .setName('id')
                .setDescription('ID del bug a resolver')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const bugId = interaction.options.getString('id', true);
        const resolver = interaction.user;

        try {
            // Buscar el bug
            const bug = await prisma.bug.findUnique({
                where: { id: bugId },
            });

            if (!bug) {
                await interaction.editReply(`❌ Bug con ID "${bugId}" no encontrado`);
                return;
            }

            if (bug.status === BugStatus.RESOLVED) {
                await interaction.editReply(`ℹ️ Este bug ya está resuelto`);
                return;
            }

            // Marcar como resuelto
            const updatedBug = await prisma.bug.update({
                where: { id: bugId },
                data: {
                    status: BugStatus.RESOLVED,
                    resolvedAt: new Date(),
                    resolvedBy: resolver.id,
                },
            });

            const embed = new EmbedBuilder()
                .setTitle('✅ Bug Resuelto')
                .setDescription(`**${bug.title}**`)
                .addFields(
                    {
                        name: '🔢 ID',
                        value: bug.id,
                        inline: true,
                    },
                    {
                        name: '👤 Resuelto por',
                        value: resolver.tag,
                        inline: true,
                    },
                    {
                        name: '📅 Fecha de resolución',
                        value: `<t:${Math.floor(updatedBug.resolvedAt!.getTime() / 1000)}:F>`,
                        inline: false,
                    },
                    {
                        name: '📝 Descripción original',
                        value: bug.description.substring(0, 1024),
                        inline: false,
                    }
                )
                .setColor(0x00ff00)
                .setTimestamp();

            if (bug.repository) {
                embed.addFields({
                    name: '📦 Repositorio',
                    value: bug.repository,
                    inline: true,
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error resolviendo bug:', error);
            await interaction.editReply('❌ Error al resolver el bug');
        }
    },

    async autocomplete(interaction: any) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'id') {
            try {
                const bugs = await prisma.bug.findMany({
                    where: { status: BugStatus.OPEN },
                    take: 25,
                    orderBy: { createdAt: 'desc' },
                });

                const filtered = bugs
                    .filter((bug: any) => {
                        const searchValue = focusedOption.value.toLowerCase();
                        return (
                            bug.id.toLowerCase().includes(searchValue) ||
                            bug.title.toLowerCase().includes(searchValue)
                        );
                    })
                    .map((bug: any) => ({
                        name: `${bug.title.substring(0, 50)} (${bug.id.substring(0, 8)})`,
                        value: bug.id,
                    }));

                await interaction.respond(filtered);
            } catch (error) {
                logger.error('Error en autocomplete de bugs:', error);
                await interaction.respond([]);
            }
        }
    },
};

