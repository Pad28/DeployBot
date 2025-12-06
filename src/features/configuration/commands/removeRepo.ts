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
    .setDescription('Elimina o desactiva un repositorio del monitoreo')
    .addStringOption((option) =>
      option
        .setName('nombre')
        .setDescription('Nombre del repositorio')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('permanente')
        .setDescription('Si es true, elimina permanentemente (por defecto: false, solo desactiva)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Verificar permisos antes de defer
    if (!await requireAdminPermission(interaction)) {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const nombre = interaction.options.getString('nombre', true);
    const permanente = interaction.options.getBoolean('permanente') ?? false;

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

      // Si solo se desactiva, verificar si ya está desactivado
      if (!permanente && !repo.isActive) {
        await interaction.editReply(`⚠️ El repositorio "${nombre}" ya está desactivado`);
        return;
      }

      // Verificar deployments en progreso
      const activeDeployments = repo._count.deployments;
      let warningMessage = '';
      if (activeDeployments > 0) {
        if (permanente) {
          warningMessage = `\n⚠️ **Atención:** Hay ${activeDeployments} deployment(s) en progreso que serán cancelados.`;
        } else {
          warningMessage = `\n⚠️ **Atención:** Hay ${activeDeployments} deployment(s) en progreso que continuarán ejecutándose.`;
        }
      }

      let embed: EmbedBuilder;
      let logMessage: string;

      if (permanente) {
        // Eliminar repositorio permanentemente (y sus deployments en cascada)
        await prisma.repository.delete({
          where: { id: repo.id },
        });

        embed = new EmbedBuilder()
          .setTitle('✅ Repositorio eliminado permanentemente')
          .setDescription(
            `**${nombre}** ha sido eliminado permanentemente de la base de datos.${warningMessage}\n\n` +
            `- El repositorio y su historial de deployments han sido eliminados\n` +
            `- Los webhooks dejarán de procesarse\n` +
            `- Esta acción **no se puede deshacer**`
          )
          .setColor(0xff0000)
          .setTimestamp();

        logMessage = `Repositorio "${nombre}" eliminado permanentemente por ${interaction.user.tag}`;
      } else {
        // Desactivar repositorio (soft delete)
        await prisma.repository.update({
          where: { id: repo.id },
          data: { isActive: false },
        });

        embed = new EmbedBuilder()
          .setTitle('✅ Repositorio desactivado')
          .setDescription(
            `**${nombre}** ha sido desactivado del monitoreo.${warningMessage}\n\n` +
            `- Los webhooks dejarán de procesarse\n` +
            `- No se crearán nuevos deployments\n` +
            `- El historial de deployments se conserva\n` +
            `- Puedes reactivarlo configurándolo de nuevo con el mismo nombre`
          )
          .setColor(0xff9900)
          .setTimestamp();

        logMessage = `Repositorio "${nombre}" desactivado por ${interaction.user.tag}`;
      }

      await interaction.editReply({ embeds: [embed] });
      logger.info(logMessage);
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

