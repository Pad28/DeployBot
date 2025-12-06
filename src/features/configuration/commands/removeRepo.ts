import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AutocompleteInteraction,
  MessageFlags,
} from 'discord.js';
import prisma from '../../../core/database/client';
import { Command } from './index';
import logger from '../../../shared/utils/logger';
import { requireAdminPermission } from '../../../shared/utils/permissions';
import { DeploymentStatus } from '@prisma/client';

export const removeRepoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('remove-repo')
    .setDescription('Elimina un repositorio del monitoreo')
    .addStringOption((option) =>
      option
        .setName('nombre')
        .setDescription('Nombre del repositorio')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Verificar permisos antes de defer
    if (!await requireAdminPermission(interaction)) {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const nombre = interaction.options.getString('nombre', true);

    try {
      const repo = await prisma.repository.findUnique({
        where: { name: nombre },
        include: {
          _count: {
            select: {
              deployments: {
                where: {
                  status: {
                    in: [DeploymentStatus.PENDING, DeploymentStatus.BUILDING, DeploymentStatus.DEPLOYING],
                  },
                },
              },
            },
          },
        },
      });

      if (!repo) {
        await interaction.editReply(`❌ Repositorio "${nombre}" no encontrado`);
        return;
      }


      // Verificar deployments en progreso
      const activeDeployments = repo._count.deployments;
      let warningMessage = '';
      if (activeDeployments > 0) {
        warningMessage = `\n⚠️ **Atención:** Hay ${activeDeployments} deployment(s) en progreso que serán cancelados.`;
      }

      // Eliminar repositorio permanentemente (y sus deployments en cascada)
      await prisma.repository.delete({
        where: { id: repo.id },
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Repositorio eliminado')
        .setDescription(
          `**${nombre}** ha sido eliminado permanentemente.${warningMessage}\n\n` +
          `- El repositorio y su historial de deployments han sido eliminados\n` +
          `- Los webhooks dejarán de procesarse\n` +
          `- Esta acción no se puede deshacer`
        )
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Repositorio "${nombre}" eliminado permanentemente por ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Error eliminando repositorio:', error);
      await interaction.editReply('❌ Error al eliminar el repositorio');
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'nombre') {
      try {
        const repos = await prisma.repository.findMany({
          where: { isActive: true },
          take: 25,
        });

        const filtered = repos
          .filter((repo: any) =>
            repo.name.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          .map((repo: any) => ({
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

