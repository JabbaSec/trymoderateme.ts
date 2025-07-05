// Make sure to install @sapphire/plugin-subcommands
import { Subcommand } from '@sapphire/plugin-subcommands';
import { container } from '@sapphire/framework';
import { MessageFlags, EmbedBuilder } from 'discord.js';
import { PaginatedMessage } from '@sapphire/discord.js-utilities';
import { sendModLog, ModLogType } from '../../lib/utils/modLogger';
import { InputSanitizer } from '../../lib/utils/sanitizer';

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
              option.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(1024)
            )
        )
        .addSubcommand((command) =>
          command
            .setName('remove')
            .setDescription('Remove a warning by its ID')
            .addIntegerOption((option) =>
              option.setName('id').setDescription('The warning ID to remove').setRequired(true)
            )
            .addStringOption((option) =>
              option.setName('reason').setDescription('Reason for removing the warning').setRequired(true)
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
    let reason = interaction.options.getString('reason', true);
    const moderator = interaction.user;
    const guild = interaction.guild;

    // Prevent self-warning or bot-warning
    if (targetUser.id === moderator.id || targetUser.bot) {
      return interaction.reply({
        content: 'You cannot warn yourself or a bot.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Sanitize content for storage and display
    const sanitizedReason = InputSanitizer.sanitizeForStorage(reason);
    const displayReason = InputSanitizer.sanitizeText(reason);
    const sanitizedUserTag = InputSanitizer.sanitizeUserTag(targetUser.tag);
    const sanitizedModeratorTag = InputSanitizer.sanitizeUserTag(moderator.tag);
    const sanitizedGuildName = InputSanitizer.sanitizeGuildName(guild?.name ?? null);

    if (!guild) {
      container.logger.warn('Tried to add a warning outside a guild.');
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    try {
      // Ensure the guild exists
      await container.prisma.guild.upsert({
        where: { id: guild.id },
        update: {},
        create: { id: guild.id, name: sanitizedGuildName }
      });

      // Ensure the user exists
      await container.prisma.user.upsert({
        where: { id_guildId: { id: targetUser.id, guildId: guild.id } },
        update: {},
        create: { id: targetUser.id, guildId: guild.id }
      });

      // Store the warning with sanitized reason
      const warning = await container.prisma.warning.create({
        data: {
          userId: targetUser.id,
          guildId: guild.id,
          reason: sanitizedReason,
          createdBy: moderator.id,
        },
      });

      // DM the warned user (ignore errors)
      const dmMessage = `You have been warned in **${sanitizedGuildName}** for: ${displayReason}\n\nIf you think this is a mistake, or would like to complain about a community moderator, please contact the community manager.`;
      try {
        await targetUser.send(dmMessage);
      } catch (err) {
        container.logger.warn(`Failed to DM user ${sanitizedUserTag} (${targetUser.id}) about warning in guild ${guild.id}`);
      }

      // Log to mod log channel
      await sendModLog({
        guild,
        type: ModLogType.Warn,
        targetUserId: targetUser.id,
        targetTag: sanitizedUserTag,
        moderatorId: moderator.id,
        moderatorTag: sanitizedModeratorTag,
        reason: displayReason,
        caseId: warning.id
      });

      container.logger.info(
        `Warning added: [ID: ${warning.id}] User: ${sanitizedUserTag} (${targetUser.id}) in Guild: ${guild.id} by Moderator: ${sanitizedModeratorTag} (${moderator.id}) Reason: ${InputSanitizer.sanitizeForLogging(reason)}`
      );

      return interaction.reply({
        content: `Warning added for ${sanitizedUserTag} (ID: ${warning.id}) for: ${displayReason}`,
        allowedMentions: { users: [targetUser.id] },
      });
    } catch (err) {
      container.logger.error(`Failed to add warning: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while adding the warning.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  public async chatInputRemove(interaction: Subcommand.ChatInputCommandInteraction) {
    const warningId = interaction.options.getInteger('id', true);
    const reason = interaction.options.getString('reason', true);
    const guild = interaction.guild;
    
    if (!guild) {
      container.logger.warn('Tried to remove a warning outside a guild.');
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // Validate and sanitize warning ID
    const idValidation = InputSanitizer.validateId(warningId);
    if (!idValidation.isValid) {
      return interaction.reply({ content: 'Invalid warning ID. Please provide a valid positive number.', flags: MessageFlags.Ephemeral });
    }

    // Sanitize reason
    const sanitizedReason = InputSanitizer.sanitizeText(reason);
    const sanitizedModeratorTag = InputSanitizer.sanitizeUserTag(interaction.user.tag);
    const sanitizedGuildName = InputSanitizer.sanitizeGuildName(guild.name);

    try {
      // Find the warning
      const warning = await container.prisma.warning.findUnique({
        where: { id: idValidation.sanitizedId },
      });
      if (!warning) {
        container.logger.warn(`Tried to remove non-existent warning ID: ${idValidation.sanitizedId} in guild ${guild.id}`);
        return interaction.reply({ content: `No warning found with ID ${idValidation.sanitizedId}.`, flags: MessageFlags.Ephemeral });
      }

      // DM the user (ignore errors)
      const dmMessage = `A warning (ID: ${warning.id}) was removed in **${sanitizedGuildName}**. Reason was: ${InputSanitizer.sanitizeText(warning.reason)}\n\nIf you think this is a mistake, or would like to complain about a community moderator, please contact the community manager.`;
      try {
        const user = await interaction.client.users.fetch(warning.userId);
        await user.send(dmMessage);
      } catch (err) {
        container.logger.warn(`Failed to DM user ${warning.userId} about warning removal in guild ${guild.id}`);
      }

      // Remove the warning
      await container.prisma.warning.delete({ where: { id: idValidation.sanitizedId } });

      // Get user info for logging
      const user = await interaction.client.users.fetch(warning.userId);
      const sanitizedUserTag = InputSanitizer.sanitizeUserTag(user.tag);

      // Log to mod log channel
      await sendModLog({
        guild,
        type: ModLogType.Unwarn,
        targetUserId: warning.userId,
        targetTag: sanitizedUserTag,
        moderatorId: interaction.user.id,
        moderatorTag: sanitizedModeratorTag,
        reason: sanitizedReason,
        caseId: warning.id
      });

      container.logger.info(
        `Warning removed: [ID: ${warning.id}] User: ${sanitizedUserTag} (${warning.userId}) in Guild: ${guild.id}`
      );

      return interaction.reply({ content: `Warning ID ${idValidation.sanitizedId} removed.` });
    } catch (err) {
      container.logger.error(`Failed to remove warning: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while removing the warning.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  public async chatInputView(interaction: Subcommand.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;
    if (!guild) {
      container.logger.warn('Tried to view warnings outside a guild.');
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    try {
      const warnings = await container.prisma.warning.findMany({
        where: { userId: targetUser.id, guildId: guild.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!warnings.length) {
        const sanitizedUserTag = InputSanitizer.sanitizeUserTag(targetUser.tag);
        container.logger.info(`No warnings found for user ${sanitizedUserTag} (${targetUser.id}) in guild ${guild.id}`);
        return interaction.reply({ content: `${sanitizedUserTag} has no warnings in this server.`, flags: MessageFlags.Ephemeral });
      }

      // Create paginated message
      const sanitizedUserTag = InputSanitizer.sanitizeUserTag(targetUser.tag);
      const paginatedMessage = new PaginatedMessage({
        template: new EmbedBuilder()
          .setColor('#FAA81A')
          .setTitle(`Warnings for ${sanitizedUserTag}`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `Total warnings: ${warnings.length}` })
      });

      // Add pages for each warning (max 5 warnings per page)
      const warningsPerPage = 5;
      for (let i = 0; i < warnings.length; i += warningsPerPage) {
        const pageWarnings = warnings.slice(i, i + warningsPerPage);
        
        paginatedMessage.addPageEmbed((embed) => {
          const warningFields = pageWarnings.map((warning: { id: number; createdAt: Date; reason: string }) => ({
            name: `Warning #${warning.id}`,
            value: `**Date:** <t:${Math.floor(warning.createdAt.getTime() / 1000)}:f>\n**Reason:** ${InputSanitizer.sanitizeText(warning.reason)}`,
            inline: false
          }));

          embed.addFields(warningFields);
          return embed;
        });
      }

      container.logger.info(
        `Viewed warnings for user ${sanitizedUserTag} (${targetUser.id}) in guild ${guild.id}`
      );

      // Run the paginated message
      await paginatedMessage.run(interaction);
      return;
    } catch (err) {
      container.logger.error(`Failed to view warnings: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while viewing warnings.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
} 