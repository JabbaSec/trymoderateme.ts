import { Subcommand } from '@sapphire/plugin-subcommands';
import { container } from '@sapphire/framework';
import { MessageFlags, escapeMarkdown, EmbedBuilder } from 'discord.js';
import { PaginatedMessage } from '@sapphire/discord.js-utilities';
import { sendModLog, ModLogType } from '../../lib/utils/modLogger';
import { ModerationErrorHandler } from '../../lib/utils/errorHandler';

const MODS_CHANNEL_ID = process.env.MODS_CHANNEL_ID;

export class NoteCommand extends Subcommand {
  public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
    super(context, {
      ...options,
      name: 'note',
      subcommands: [
        { name: 'add', chatInputRun: 'chatInputAdd' },
        { name: 'remove', chatInputRun: 'chatInputRemove' },
        { name: 'view', chatInputRun: 'chatInputView' }
      ],
      description: 'Manage user notes',
      preconditions: ['TrialModeratorOnly']
    });
  }

  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('note')
        .setDescription('Manage user notes')
        .addSubcommand((command) =>
          command
            .setName('add')
            .setDescription('Add a note to a user')
            .addUserOption((option) =>
              option.setName('user').setDescription('The user to add a note to').setRequired(true)
            )
            .addStringOption((option) =>
              option.setName('content').setDescription('Note content').setRequired(true).setMaxLength(1024)
            )
        )
        .addSubcommand((command) =>
          command
            .setName('remove')
            .setDescription('Remove a note by its ID')
            .addIntegerOption((option) =>
              option.setName('id').setDescription('The note ID to remove').setRequired(true)
            )
            .addStringOption((option) =>
              option.setName('reason').setDescription('Reason for removing the note').setRequired(true)
            )
        )
        .addSubcommand((command) =>
          command
            .setName('view')
            .setDescription('View all notes for a user')
            .addUserOption((option) =>
              option.setName('user').setDescription('The user to view notes for').setRequired(true)
            )
        )
    );
  }

  private isModsChannel(channelId: string): boolean {
    return MODS_CHANNEL_ID ? channelId === MODS_CHANNEL_ID : false;
  }

  private getResponseFlags(channelId: string): MessageFlags.Ephemeral | undefined {
    return this.isModsChannel(channelId) ? undefined : MessageFlags.Ephemeral;
  }

  public async chatInputAdd(interaction: Subcommand.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    let content = interaction.options.getString('content', true);
    const moderator = interaction.user;
    const guild = interaction.guild;
    const responseFlags = this.getResponseFlags(interaction.channelId);

    // Validate guild context
    const guildValidation = ModerationErrorHandler.validateGuildContext(guild, 'add a note');
    if (!guildValidation.isValid) {
      return interaction.reply({ content: guildValidation.errorMessage, ...(responseFlags && { flags: responseFlags }) });
    }

    // Validate target
    const targetValidation = ModerationErrorHandler.validateTarget(targetUser.id, moderator.id, targetUser, 'add a note to');
    if (!targetValidation.isValid) {
      return interaction.reply({ content: targetValidation.errorMessage, ...(responseFlags && { flags: responseFlags }) });
    }

    // Sanitize content
    content = escapeMarkdown(content).replace(/<@!?\d+>/g, '[mention removed]').trim();

    try {
      // Ensure the guild exists
      await container.prisma.guild.upsert({
        where: { id: guild!.id },
        update: {},
        create: { id: guild!.id, name: guild!.name ?? undefined }
      });

      // Ensure the user exists
      await container.prisma.user.upsert({
        where: { id_guildId: { id: targetUser.id, guildId: guild!.id } },
        update: {},
        create: { id: targetUser.id, guildId: guild!.id }
      });

      // Store the note
      const note = await container.prisma.note.create({
        data: {
          userId: targetUser.id,
          guildId: guild!.id,
          content,
          createdBy: moderator.id,
        },
      });

      // Log to mod log channel
      await sendModLog({
        guild: guild!,
        type: ModLogType.Note,
        targetUserId: targetUser.id,
        targetTag: targetUser.tag,
        moderatorId: moderator.id,
        moderatorTag: moderator.tag,
        reason: content,
        caseId: note.id
      });

      container.logger.info(
        `Note added: [ID: ${note.id}] User: ${targetUser.tag} (${targetUser.id}) in Guild: ${guild!.id} by Moderator: ${moderator.tag} (${moderator.id}) Content: ${content}`
      );

      return interaction.reply({
        content: `Note added for ${targetUser.tag} (ID: ${note.id}) for: ${content}`,
        allowedMentions: { users: [targetUser.id] },
        ...(responseFlags && { flags: responseFlags })
      });
    } catch (err) {
      const errorMessage = ModerationErrorHandler.handlePrismaError(err, 'adding the note');
      return interaction.reply({
        content: errorMessage,
        ...(responseFlags && { flags: responseFlags })
      });
    }
  }

  public async chatInputRemove(interaction: Subcommand.ChatInputCommandInteraction) {
    const noteId = interaction.options.getInteger('id', true);
    const reason = interaction.options.getString('reason', true);
    const guild = interaction.guild;
    const responseFlags = this.getResponseFlags(interaction.channelId);

    // Validate guild context
    const guildValidation = ModerationErrorHandler.validateGuildContext(guild, 'remove a note');
    if (!guildValidation.isValid) {
      return interaction.reply({ content: guildValidation.errorMessage, ...(responseFlags && { flags: responseFlags }) });
    }

    // Validate note ID
    const idValidation = ModerationErrorHandler.validateId(noteId);
    if (!idValidation.isValid) {
      return interaction.reply({ content: idValidation.errorMessage, ...(responseFlags && { flags: responseFlags }) });
    }

    try {
      // Find the note
      const note = await container.prisma.note.findUnique({
        where: { id: noteId },
      });
      
      if (!note) {
        container.logger.warn(`Tried to remove non-existent note ID: ${noteId} in guild ${guild!.id}`);
        return interaction.reply({ 
          content: `No note found with ID ${noteId}.`, 
          ...(responseFlags && { flags: responseFlags })
        });
      }

      // Check if the note belongs to this guild
      const ownershipValidation = ModerationErrorHandler.validateGuildOwnership(note.guildId, guild!.id, 'note');
      if (!ownershipValidation.isValid) {
        return interaction.reply({ content: ownershipValidation.errorMessage, ...(responseFlags && { flags: responseFlags }) });
      }

      // Remove the note
      await container.prisma.note.delete({ where: { id: noteId } });

      // Log to mod log channel
      await sendModLog({
        guild: guild!,
        type: ModLogType.NoteRemoved,
        targetUserId: note.userId,
        targetTag: (await interaction.client.users.fetch(note.userId)).tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        caseId: note.id
      });

      container.logger.info(
        `Note removed: [ID: ${note.id}] User: ${note.userId} in Guild: ${guild!.id}`
      );

      return interaction.reply({ content: `Note ID ${noteId} removed.`, ...(responseFlags && { flags: responseFlags }) });
    } catch (err) {
      const errorMessage = ModerationErrorHandler.handlePrismaError(err, 'removing the note', noteId);
      return interaction.reply({
        content: errorMessage,
        ...(responseFlags && { flags: responseFlags })
      });
    }
  }

  public async chatInputView(interaction: Subcommand.ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;
    const responseFlags = this.getResponseFlags(interaction.channelId);

    // Validate guild context
    const guildValidation = ModerationErrorHandler.validateGuildContext(guild, 'view notes');
    if (!guildValidation.isValid) {
      return interaction.reply({ content: guildValidation.errorMessage, ...(responseFlags && { flags: responseFlags }) });
    }

    try {
      const notes = await container.prisma.note.findMany({
        where: { userId: targetUser.id, guildId: guild!.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!notes.length) {
        container.logger.info(`No notes found for user ${targetUser.tag} (${targetUser.id}) in guild ${guild!.id}`);
        return interaction.reply({ content: `${targetUser.tag} has no notes in this server.`, ...(responseFlags && { flags: responseFlags }) });
      }

      // Create paginated message
      const paginatedMessage = new PaginatedMessage({
        template: new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle(`Notes for ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `Total notes: ${notes.length}` })
      });

      // Add pages for each note (max 5 notes per page)
      const notesPerPage = 5;
      for (let i = 0; i < notes.length; i += notesPerPage) {
        const pageNotes = notes.slice(i, i + notesPerPage);
        
        paginatedMessage.addPageEmbed((embed) => {
          const noteFields = pageNotes.map((note: { id: number; createdAt: Date; content: string }) => ({
            name: `Note #${note.id}`,
            value: `**Date:** <t:${Math.floor(note.createdAt.getTime() / 1000)}:f>\n**Content:** ${escapeMarkdown(note.content)}`,
            inline: false
          }));

          embed.addFields(noteFields);
          return embed;
        });
      }

      container.logger.info(
        `Viewed notes for user ${targetUser.tag} (${targetUser.id}) in guild ${guild!.id}`
      );

      // Run the paginated message
      await paginatedMessage.run(interaction);
      return;
    } catch (err) {
      const errorMessage = ModerationErrorHandler.handlePrismaError(err, 'viewing notes');
      return interaction.reply({
        content: errorMessage,
        ...(responseFlags && { flags: responseFlags })
      });
    }
  }
} 