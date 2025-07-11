import { Command } from '@sapphire/framework';
import { container } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { sendModLog, ModLogType } from '../../lib/utils/modLogger';
import { InputSanitizer } from '../../lib/utils/sanitizer';

export class UnbanCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'unban',
      description: 'Unban a user from the server',
      preconditions: ['ModeratorOnly']
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('unban')
        .setDescription('Unban a user from the server')
        .addStringOption((option) =>
          option.setName('userid').setDescription('The user ID to unban').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for the unban').setRequired(true).setMaxLength(1024)
        )
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const userId = interaction.options.getString('userid', true);
    const reason = interaction.options.getString('reason', true);
    const moderator = interaction.user;
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // Validate user ID
    if (!/^[0-9]{15,21}$/.test(userId)) {
      return interaction.reply({ content: 'Please provide a valid user ID.', flags: MessageFlags.Ephemeral });
    }

    // Sanitize input
    const sanitizedReason = InputSanitizer.sanitizeForStorage(reason);
    const displayReason = InputSanitizer.sanitizeText(reason);
    const sanitizedModeratorTag = InputSanitizer.sanitizeUserTag(moderator.tag);

    try {
      // Check if the user is banned
      const ban = await guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        return interaction.reply({ content: `User ID ${userId} is not banned.`, flags: MessageFlags.Ephemeral });
      }

      // Unban the user
      await guild.members.unban(userId, sanitizedReason);

      // Log to mod log channel
      await sendModLog({
        guild,
        type: ModLogType.Unban,
        targetUserId: userId,
        targetTag: ban.user?.tag ? InputSanitizer.sanitizeUserTag(ban.user.tag) : 'Unknown User',
        moderatorId: moderator.id,
        moderatorTag: sanitizedModeratorTag,
        reason: displayReason
      });

      container.logger.info(
        `User unbanned: ${ban.user?.tag ?? userId} (${userId}) in Guild: ${guild.id} by Moderator: ${sanitizedModeratorTag} (${moderator.id}) Reason: ${InputSanitizer.sanitizeForLogging(reason)}`
      );

      return interaction.reply({
        content: `Unbanned ${ban.user?.tag ? InputSanitizer.sanitizeUserTag(ban.user.tag) : userId} for: ${displayReason}`
      });
    } catch (err) {
      container.logger.error(`Failed to unban user: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while unbanning the user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
} 