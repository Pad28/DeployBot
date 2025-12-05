import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Repository } from '@prisma/client';
import { BranchConfig, DeploymentStatus } from '../../core/types';
import { getBotInstance } from '../../core/discord/botInstance';
import logger from '../../shared/utils/logger';

interface CommitInfo {
  id: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
}

export async function sendNotification(
  channelId: string,
  repo: Repository,
  branchConfig: BranchConfig,
  commit: CommitInfo,
  status: DeploymentStatus,
  deploymentId: string,
  error?: string
) {
  try {
    // Obtener instancia del bot
    const bot = getBotInstance();

    if (!bot) {
      logger.warn('Bot de Discord no disponible para enviar notificación');
      return;
    }

    const channel = await bot.getChannel(channelId);
    if (!channel) {
      logger.warn(`Canal ${channelId} no encontrado`);
      return;
    }

    if (!channel.isTextBased() || channel.isDMBased()) {
      logger.warn(`Canal ${channelId} no es un canal de texto válido`);
      return;
    }

    // Verificar permisos del bot en el canal
    const botMember = channel.guild?.members.me;
    if (botMember) {
      const permissions = channel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        const channelName = 'name' in channel ? channel.name : channelId;
        logger.error(
          `❌ Permisos insuficientes en el canal #${channelName} (${channelId}). ` +
          `El bot necesita: Send Messages y Embed Links. ` +
          `Configura estos permisos en la configuración del canal o rol del bot.`
        );
        return;
      }
    }

    const color = status === DeploymentStatus.SUCCESS ? 0x00ff00 : 0xff0000;
    const emoji = status === DeploymentStatus.SUCCESS ? '✅' : '❌';
    const title = `${emoji} Deployment ${status === DeploymentStatus.SUCCESS ? 'Exitoso' : 'Fallido'}`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`**${repo.name}** → \`${branchConfig.branch}\``)
      .addFields(
        {
          name: '📦 Repositorio',
          value: repo.name,
          inline: true,
        },
        {
          name: '🌿 Rama',
          value: branchConfig.branch,
          inline: true,
        },
        {
          name: '🌍 Ambiente',
          value: branchConfig.environment || branchConfig.branch,
          inline: true,
        },
        {
          name: '💬 Commit',
          value: `\`${commit.id.substring(0, 7)}\``,
          inline: true,
        },
        {
          name: '👤 Autor',
          value: commit.author.name,
          inline: true,
        },
        {
          name: '📝 Mensaje',
          value: commit.message.substring(0, 100) + (commit.message.length > 100 ? '...' : ''),
          inline: false,
        }
      )
      .setColor(color)
      .setTimestamp();

    if (error) {
      embed.addFields({
        name: '❌ Error',
        value: `\`\`\`${error.substring(0, 1000)}\`\`\``,
        inline: false,
      });
    }

    await channel.send({ embeds: [embed] });
  } catch (error: any) {
    if (error?.code === 50013) {
      logger.error(`❌ Permisos insuficientes en el canal ${channelId}. Verifica que el bot tenga permisos para enviar mensajes y embeds.`);
    } else {
      logger.error('Error enviando notificación a Discord:', error);
    }
  }
}

