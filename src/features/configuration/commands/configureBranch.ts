import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  AutocompleteInteraction,
  MessageFlags,
} from 'discord.js';
import prisma from '../../../core/database/client';
import { Command } from './index';
import { BranchConfig } from '../../../core/types';
import logger from '../../../shared/utils/logger';

export const configureBranchCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config-branch')
    .setDescription('Configura una rama para monitorear y notificar')
    .addStringOption((option) =>
      option
        .setName('repo')
        .setDescription('Nombre del repositorio')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('branch')
        .setDescription('Nombre de la rama (ej: staging, main, develop)')
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName('canal')
        .setDescription('Canal de Discord para notificaciones de deployments')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption((option) =>
      option
        .setName('canal-pr')
        .setDescription('Canal de Discord para notificaciones de Pull Requests (opcional)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption((option) =>
      option
        .setName('build-command')
        .setDescription('Comando de build (ej: npm run build)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('deploy-command')
        .setDescription('Comando de deploy (ej: npm run deploy)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('environment')
        .setDescription('Nombre del ambiente (ej: staging, production)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const repoName = interaction.options.getString('repo', true);
    const branch = interaction.options.getString('branch', true);
    const channel = interaction.options.getChannel('canal', true);
    const prChannel = interaction.options.getChannel('canal-pr');
    const buildCommand = interaction.options.getString('build-command');
    const deployCommand = interaction.options.getString('deploy-command');
    const environment = interaction.options.getString('environment') || branch;

    try {
      const repo = await prisma.repository.findUnique({
        where: { name: repoName },
      });

      if (!repo) {
        await interaction.editReply(`❌ Repositorio "${repoName}" no encontrado`);
        return;
      }

      const branches = (Array.isArray(repo.branches) ? (repo.branches as unknown as BranchConfig[]) : []) || [];
      const existingIndex = branches.findIndex((b) => b.branch === branch);

      const branchConfig: BranchConfig = {
        branch,
        discordChannelId: channel.id,
        prChannelId: prChannel?.id || undefined,
        buildCommand: buildCommand || undefined,
        deployCommand: deployCommand || undefined,
        environment,
      };

      if (existingIndex >= 0) {
        branches[existingIndex] = branchConfig;
      } else {
        branches.push(branchConfig);
      }

      await prisma.repository.update({
        where: { id: repo.id },
        data: { branches: branches as any },
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Rama configurada')
        .setDescription(`**${repoName}** → \`${branch}\``)
        .addFields(
          { name: 'Canal Deployments', value: `<#${channel.id}>`, inline: true },
          { name: 'Canal PRs', value: prChannel ? `<#${prChannel.id}>` : 'Mismo que deployments', inline: true },
          { name: 'Ambiente', value: environment, inline: true },
          {
            name: 'Build',
            value: buildCommand || 'No configurado',
            inline: false,
          },
          {
            name: 'Deploy',
            value: deployCommand || 'No configurado',
            inline: false,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error configurando rama:', error);
      await interaction.editReply('❌ Error al configurar la rama');
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'repo') {
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

