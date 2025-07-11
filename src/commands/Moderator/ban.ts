import { Command } from '@sapphire/framework';
import { container } from '@sapphire/framework';
import { MessageFlags, GuildMember } from 'discord.js';
import { sendModLog, ModLogType } from '../../lib/utils/modLogger';
import { InputSanitizer } from '../../lib/utils/sanitizer';

export class BanCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'ban',
      description: 'Ban a user from the server',
      preconditions: ['ModeratorOnly']
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to ban').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for the ban').setRequired(true).setMaxLength(1024)
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

    // Prevent self-ban
    if (targetUser.id === moderator.id) {
      return interaction.reply({
        content: 'You cannot ban yourself.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Prevent bot-ban
    if (targetUser.bot) {
      return interaction.reply({
        content: 'You cannot ban a bot.',
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
          content: 'You cannot ban someone with a higher or equal role to yourself.',
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
      // DM the user before banning
      const dmMessage = `You have been banned from **${sanitizedGuildName}** for: ${displayReason}\n\nIf you believe this was a mistake or wish to appeal, please email bans@tryhackme.com.`;
      try {
        await targetUser.send(dmMessage);
      } catch (err) {
        container.logger.warn(`Failed to DM user ${sanitizedUserTag} (${targetUser.id}) about ban in guild ${guild.id}`);
      }

      // Ban the user
      await guild.members.ban(targetUser.id, { reason: sanitizedReason });

      // Log to mod log channel
      await sendModLog({
        guild,
        type: ModLogType.Ban,
        targetUserId: targetUser.id,
        targetTag: sanitizedUserTag,
        moderatorId: moderator.id,
        moderatorTag: sanitizedModeratorTag,
        reason: displayReason
      });

      container.logger.info(
        `User banned: ${sanitizedUserTag} (${targetUser.id}) in Guild: ${guild.id} by Moderator: ${sanitizedModeratorTag} (${moderator.id}) Reason: ${InputSanitizer.sanitizeForLogging(reason)}`
      );

      return interaction.reply({
        content: `Banned ${sanitizedUserTag} for: ${displayReason}`,
        allowedMentions: { users: [targetUser.id] }
      });
    } catch (err) {
      container.logger.error(`Failed to ban user: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while banning the user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
} 