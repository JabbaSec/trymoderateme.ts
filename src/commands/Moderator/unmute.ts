import { Command } from '@sapphire/framework';
import { container } from '@sapphire/framework';
import { MessageFlags, GuildMember } from 'discord.js';
import { sendModLog, ModLogType } from '../../lib/utils/modLogger';
import { InputSanitizer } from '../../lib/utils/sanitizer';

export class UnmuteCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'unmute',
      description: 'Unmute (remove timeout) from a user in the server',
      preconditions: ['TrialModeratorOnly']
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('unmute')
        .setDescription('Unmute (remove timeout) from a user in the server')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to unmute').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for the unmute').setRequired(true).setMaxLength(1024)
        )
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const moderator = interaction.user;
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // Prevent self-unmute
    if (targetUser.id === moderator.id) {
      return interaction.reply({
        content: 'You cannot unmute yourself.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Prevent bot-unmute
    if (targetUser.bot) {
      return interaction.reply({
        content: 'You cannot unmute a bot.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Role hierarchy check (only if both are guild members)
    let targetMember: GuildMember | null = null;
    let moderatorMember: GuildMember | null = null;
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {}
    try {
      moderatorMember = await guild.members.fetch(moderator.id);
    } catch {}
    if (targetMember && moderatorMember) {
      if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position) {
        return interaction.reply({
          content: 'You cannot unmute someone with a higher or equal role to yourself.',
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // Sanitize input
    const sanitizedReason = InputSanitizer.sanitizeForStorage(reason);
    const displayReason = InputSanitizer.sanitizeText(reason);
    const sanitizedUserTag = InputSanitizer.sanitizeUserTag(targetUser.tag);
    const sanitizedModeratorTag = InputSanitizer.sanitizeUserTag(moderator.tag);
    const sanitizedGuildName = InputSanitizer.sanitizeGuildName(guild.name);

    try {
      // DM the user before unmuting
      const dmMessage = `You have been unmuted in **${sanitizedGuildName}**. Reason: ${displayReason}`;
      try {
        await targetUser.send(dmMessage);
      } catch (err) {
        container.logger.warn(`Failed to DM user ${sanitizedUserTag} (${targetUser.id}) about unmute in guild ${guild.id}`);
      }

      // Remove timeout (unmute) the user
      if (!targetMember) {
        return interaction.reply({ content: 'Could not find that user in this server.', flags: MessageFlags.Ephemeral });
      }
      await targetMember.timeout(null, sanitizedReason);

      // Mark the mute as inactive in the database (latest active mute)
      await container.prisma.mute.updateMany({
        where: {
          userId: targetUser.id,
          guildId: guild.id,
          active: true
        },
        data: { active: false }
      });

      // Log to mod log channel
      await sendModLog({
        guild,
        type: ModLogType.Unmute,
        targetUserId: targetUser.id,
        targetTag: sanitizedUserTag,
        moderatorId: moderator.id,
        moderatorTag: sanitizedModeratorTag,
        reason: displayReason
      });

      container.logger.info(
        `User unmuted: ${sanitizedUserTag} (${targetUser.id}) in Guild: ${guild.id} by Moderator: ${sanitizedModeratorTag} (${moderator.id}) Reason: ${InputSanitizer.sanitizeForLogging(reason)}`
      );

      return interaction.reply({
        content: `Unmuted ${sanitizedUserTag} for: ${displayReason}`,
        allowedMentions: { users: [targetUser.id] }
      });
    } catch (err) {
      container.logger.error(`Failed to unmute user: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while unmuting the user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
} 