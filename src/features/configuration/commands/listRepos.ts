import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import prisma from '../../../core/database/client';
import { Command } from './index';
import logger from '../../../shared/utils/logger';

export const listReposCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('list-repos')
    .setDescription('Lista todos los repositorios monitoreados'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const repos = await prisma.repository.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { deployments: true },
          },
        },
      });

      if (repos.length === 0) {
        await interaction.editReply('📭 No hay repositorios configurados');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📦 Repositorios Monitoreados')
        .setDescription(`Total: ${repos.length}`)
        .setColor(0x0099ff)
        .setTimestamp();

      repos.forEach((repo) => {
        const branches = (repo.branches as any[]) || [];
        embed.addFields({
          name: `🔹 ${repo.name}`,
          value: [
            `**Provider:** ${repo.provider}`,
            `**Branches configuradas:** ${branches.length}`,
            `**Deployments:** ${repo._count.deployments}`,
            `**Estado:** ${repo.isActive ? '✅ Activo' : '❌ Inactivo'}`,
          ].join('\n'),
          inline: false,
        });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error listando repositorios:', error);
      await interaction.editReply('❌ Error al listar repositorios');
    }
  },
};

