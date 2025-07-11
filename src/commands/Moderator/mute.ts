import { Command } from '@sapphire/framework';
import { container } from '@sapphire/framework';
import { MessageFlags, GuildMember, time } from 'discord.js';
import { sendModLog, ModLogType } from '../../lib/utils/modLogger';
import { InputSanitizer } from '../../lib/utils/sanitizer';

export class MuteCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'mute',
      description: 'Mute (timeout) a user in the server',
      preconditions: ['TrialModeratorOnly']
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('mute')
        .setDescription('Mute (timeout) a user in the server')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to mute').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for the mute').setRequired(true).setMaxLength(1024)
        )
        .addIntegerOption((option) =>
          option.setName('duration').setDescription('Duration in minutes (1-10080)').setRequired(true).setMinValue(1).setMaxValue(10080)
        )
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const durationMinutes = interaction.options.getInteger('duration', true);
    const moderator = interaction.user;
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // Prevent self-mute
    if (targetUser.id === moderator.id) {
      return interaction.reply({
        content: 'You cannot mute yourself.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Prevent bot-mute
    if (targetUser.bot) {
      return interaction.reply({
        content: 'You cannot mute a bot.',
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
          content: 'You cannot mute someone with a higher or equal role to yourself.',
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

    // Calculate mute expiration
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    try {
      // DM the user before muting
      const dmMessage = `You have been muted in **${sanitizedGuildName}** for ${durationMinutes} minute(s) for: ${displayReason}\n\nYou will be able to chat again at ${time(expiresAt, 'F')}.\n\nIf you think this was a mistake, or would like to complain about a community moderator, please contact the community manager.`;
      try {
        await targetUser.send(dmMessage);
      } catch (err) {
        container.logger.warn(`Failed to DM user ${sanitizedUserTag} (${targetUser.id}) about mute in guild ${guild.id}`);
      }

      // Timeout (mute) the user
      if (!targetMember) {
        return interaction.reply({ content: 'Could not find that user in this server.', flags: MessageFlags.Ephemeral });
      }
      await targetMember.timeout(durationMinutes * 60 * 1000, sanitizedReason);

      // Store the mute in the database
      await container.prisma.guild.upsert({
        where: { id: guild.id },
        update: {},
        create: { id: guild.id, name: sanitizedGuildName }
      });
      await container.prisma.user.upsert({
        where: { id_guildId: { id: targetUser.id, guildId: guild.id } },
        update: {},
        create: { id: targetUser.id, guildId: guild.id }
      });
      const mute = await container.prisma.mute.create({
        data: {
          userId: targetUser.id,
          guildId: guild.id,
          reason: sanitizedReason,
          createdBy: moderator.id,
          duration: durationMinutes * 60, // seconds
          expiresAt,
          active: true
        }
      });

      // Log to mod log channel
      await sendModLog({
        guild,
        type: ModLogType.Mute,
        targetUserId: targetUser.id,
        targetTag: sanitizedUserTag,
        moderatorId: moderator.id,
        moderatorTag: sanitizedModeratorTag,
        reason: displayReason,
        duration: `${durationMinutes} minute(s)`,
        caseId: mute.id
      });

      container.logger.info(
        `User muted: [ID: ${mute.id}] ${sanitizedUserTag} (${targetUser.id}) in Guild: ${guild.id} by Moderator: ${sanitizedModeratorTag} (${moderator.id}) Reason: ${InputSanitizer.sanitizeForLogging(reason)} Duration: ${durationMinutes}m`
      );

      return interaction.reply({
        content: `Muted ${sanitizedUserTag} for ${durationMinutes} minute(s) for: ${displayReason}`,
        allowedMentions: { users: [targetUser.id] }
      });
    } catch (err) {
      container.logger.error(`Failed to mute user: ${err}`);
      return interaction.reply({
        content: 'An unexpected error occurred while muting the user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
} 