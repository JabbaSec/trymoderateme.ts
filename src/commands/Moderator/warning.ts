// Make sure to install @sapphire/plugin-subcommands
import { Subcommand } from '@sapphire/plugin-subcommands';
import { container } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';

export class WarningCommand extends Subcommand {
  public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
    super(context, {
      ...options,
      name: 'warning',
      subcommands: [
        { name: 'add', chatInputRun: 'chatInputAdd' },
        { name: 'remove', chatInputRun: 'chatInputRemove' },
        { name: 'view', chatInputRun: 'chatInputView' }
      ],
      description: 'Manage user warnings',
      preconditions: ['TrialModeratorOnly']
    });
  }

  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('warning')
        .setDescription('Manage user warnings')
        .addSubcommand((command) =>
          command
            .setName('add')
            .setDescription('Add a warning to a user')
            .addUserOption((option) =>
              option.setName('user').setDescription('The user to warn').setRequired(true)
            )
            .addStringOption((option) =>
              option.setName('reason').setDescription('Reason for the warning').setRequired(true)
            )
        )
        .addSubcommand((command) =>
          command
            .setName('remove')
            .setDescription('Remove a warning by its ID')
            .addStringOption((option) =>
              option.setName('id').setDescription('The warning ID to remove').setRequired(true)
            )
        )
        .addSubcommand((command) =>
          command
            .setName('view')
            .setDescription('View all warnings for a user')
            .addUserOption((option) =>
              option.setName('user').setDescription('The user to view warnings for').setRequired(true)
            )
        )
    );
  }

  public async chatInputAdd(interaction: Subcommand.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const moderator = interaction.user;
    const guild = interaction.guild;

    if (!guild) {
      container.logger.warn('Tried to add a warning outside a guild.');
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // Ensure the guild exists
    await container.prisma.guild.upsert({
      where: { id: guild.id },
      update: {},
      create: { id: guild.id, name: guild.name ?? undefined }
    });

    // Ensure the user exists
    await container.prisma.user.upsert({
      where: { id_guildId: { id: targetUser.id, guildId: guild.id } },
      update: {},
      create: { id: targetUser.id, guildId: guild.id }
    });

    // Store the warning
    const warning = await container.prisma.warning.create({
      data: {
        userId: targetUser.id,
        guildId: guild.id,
        reason,
        createdBy: moderator.id,
      },
    });

    // DM the warned user (ignore errors)
    const dmMessage = `You have been warned in **${guild.name}** for: ${reason}\n\nIf you think this is a mistake, or would like to complain about a community moderator, please contact the community manager.`;
    try {
      await targetUser.send(dmMessage);
    } catch (err) {
      container.logger.warn(`Failed to DM user ${targetUser.tag} (${targetUser.id}) about warning in guild ${guild.id}`);
    }

    container.logger.info(
      `Warning added: [ID: ${warning.id}] User: ${targetUser.tag} (${targetUser.id}) in Guild: ${guild.id} by Moderator: ${moderator.tag} (${moderator.id}) Reason: ${reason}`
    );

    return interaction.reply({
      content: `Warning added for ${targetUser.tag} (ID: ${warning.id}) for: ${reason}`,
      allowedMentions: { users: [targetUser.id] },
    });
  }

  public async chatInputRemove(interaction: Subcommand.ChatInputCommandInteraction) {
    const warningId = parseInt(interaction.options.getString('id', true), 10);
    const guild = interaction.guild;
    if (!guild) {
      container.logger.warn('Tried to remove a warning outside a guild.');
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // Find the warning
    const warning = await container.prisma.warning.findUnique({
      where: { id: warningId },
    });
    if (!warning) {
      container.logger.warn(`Tried to remove non-existent warning ID: ${warningId} in guild ${guild.id}`);
      return interaction.reply({ content: `No warning found with ID ${warningId}.`, flags: MessageFlags.Ephemeral });
    }

    // Remove the warning
    await container.prisma.warning.delete({ where: { id: warningId } });

    // DM the user (ignore errors)
    const dmMessage = `A warning (ID: ${warning.id}) was removed in **${guild.name}**. Reason was: ${warning.reason}\n\nIf you think this is a mistake, or would like to complain about a community moderator, please contact the community manager.`;
    try {
      const user = await interaction.client.users.fetch(warning.userId);
      await user.send(dmMessage);
    } catch (err) {
      container.logger.warn(`Failed to DM user ${warning.userId} about warning removal in guild ${guild.id}`);
    }

    container.logger.info(
      `Warning removed: [ID: ${warning.id}] User: ${warning.userId} in Guild: ${guild.id}`
    );

    return interaction.reply({ content: `Warning ID ${warningId} removed.` });
  }

  public async chatInputView(interaction: Subcommand.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;
    if (!guild) {
      container.logger.warn('Tried to view warnings outside a guild.');
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    const warnings = await container.prisma.warning.findMany({
      where: { userId: targetUser.id, guildId: guild.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!warnings.length) {
      container.logger.info(`No warnings found for user ${targetUser.tag} (${targetUser.id}) in guild ${guild.id}`);
      return interaction.reply({ content: `${targetUser.tag} has no warnings in this server.`, flags: MessageFlags.Ephemeral });
    }

    const lines = warnings.map((w: { id: number; createdAt: Date; reason: string }) => `**ID:** ${w.id} | **Date:** <t:${Math.floor(w.createdAt.getTime() / 1000)}:f>\n**Reason:** ${w.reason}`);
    const content = `Warnings for ${targetUser.tag} (${warnings.length}):\n\n${lines.join('\n\n')}`;
    container.logger.info(
      `Viewed warnings for user ${targetUser.tag} (${targetUser.id}) in guild ${guild.id}`
    );
    return interaction.reply({ content });
  }
} 