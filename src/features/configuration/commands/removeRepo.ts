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

      if (!repo.isActive) {
        await interaction.editReply(`⚠️ El repositorio "${nombre}" ya está desactivado`);
        return;
      }

      // Verificar deployments en progreso
      const activeDeployments = repo._count.deployments;
      let warningMessage = '';
      if (activeDeployments > 0) {
        warningMessage = `\n⚠️ **Atención:** Hay ${activeDeployments} deployment(s) en progreso que continuarán ejecutándose.`;
      }

      // Desactivar repositorio
      await prisma.repository.update({
        where: { id: repo.id },
        data: { isActive: false },
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Repositorio desactivado')
        .setDescription(
          `**${nombre}** ha sido desactivado del monitoreo.${warningMessage}\n\n` +
          `- Los webhooks dejarán de procesarse\n` +
          `- No se crearán nuevos deployments\n` +
          `- El historial de deployments se conserva`
        )
        .setColor(0xff9900)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
      logger.info(`Repositorio "${nombre}" desactivado por ${interaction.user.tag}`);
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

