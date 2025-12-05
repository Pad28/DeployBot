import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Repository } from '../../generated/prisma/client';
import { getBotInstance } from '../../core/discord/botInstance';
import logger from '../../shared/utils/logger';

interface PRInfo {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  merged: boolean;
  url: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export type PRAction = 'opened' | 'closed' | 'reopened' | 'synchronize' | 'merged';

export async function sendPullRequestNotification(
  channelId: string,
  repo: Repository,
  prInfo: PRInfo,
  action: PRAction
) {
  try {
    const bot = getBotInstance();
    
    if (!bot) {
      logger.warn('Bot de Discord no disponible para enviar notificación de PR');
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
    
    // Determinar color y emoji según la acción
    let color: number;
    let emoji: string;
    let title: string;

    switch (action) {
      case 'opened':
        color = 0x00aaff;
        emoji = '🆕';
        title = 'Nuevo Pull Request';
        break;
      case 'closed':
        if (prInfo.merged) {
          color = 0x00ff00;
          emoji = '✅';
          title = 'Pull Request Mergeado';
        } else {
          color = 0xff9900;
          emoji = '❌';
          title = 'Pull Request Cerrado';
        }
        break;
      case 'merged':
        color = 0x00ff00;
        emoji = '✅';
        title = 'Pull Request Mergeado';
        break;
      case 'reopened':
        color = 0x00aaff;
        emoji = '🔄';
        title = 'Pull Request Reabierto';
        break;
      case 'synchronize':
        color = 0x0099ff;
        emoji = '🔄';
        title = 'Pull Request Actualizado';
        break;
      default:
        color = 0x0099ff;
        emoji = '📝';
        title = 'Pull Request';
    }

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${title}`)
      .setDescription(`**${prInfo.title}**`)
      .setURL(prInfo.url)
      .addFields(
        {
          name: '📦 Repositorio',
          value: repo.name,
          inline: true,
        },
        {
          name: '🔢 PR #',
          value: `#${prInfo.number}`,
          inline: true,
        },
        {
          name: '🌿 Ramas',
          value: `\`${prInfo.headBranch}\` → \`${prInfo.baseBranch}\``,
          inline: true,
        },
        {
          name: '👤 Autor',
          value: prInfo.author,
          inline: true,
        },
        {
          name: '📊 Estado',
          value: prInfo.merged ? '✅ Mergeado' : prInfo.state === 'open' ? '🟢 Abierto' : '🔴 Cerrado',
          inline: true,
        }
      )
      .setColor(color)
      .setTimestamp(new Date(prInfo.updatedAt));

    if (prInfo.body && prInfo.body.length > 0) {
      const description = prInfo.body.length > 500 
        ? prInfo.body.substring(0, 500) + '...' 
        : prInfo.body;
      embed.addFields({
        name: '📝 Descripción',
        value: description,
        inline: false,
      });
    }

    if (prInfo.mergedAt) {
      embed.addFields({
        name: '⏰ Mergeado',
        value: `<t:${Math.floor(new Date(prInfo.mergedAt).getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    if (prInfo.authorAvatar) {
      embed.setThumbnail(prInfo.authorAvatar);
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error enviando notificación de PR a Discord:', error);
  }
}

