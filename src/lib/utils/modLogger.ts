import { container } from '@sapphire/framework';
import { ChannelType, EmbedBuilder, Guild, TextChannel, User } from 'discord.js';

const LOG_CHANNEL_ID = process.env.BOT_LOGGING_CHANNEL_ID;

export enum ModLogType {
  Warn = 'Warn',
  Unwarn = 'Unwarn',
  Mute = 'Mute',
  Unmute = 'Unmute',
  Ban = 'Ban',
  Unban = 'Unban',
  Kick = 'Kick',
  Note = 'Note',
  NoteRemoved = 'Note Removed',
  Other = 'Other'
}

interface ModLogOptions {
  guild: Guild;
  type: ModLogType;
  targetUserId: string;
  targetTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason?: string;
  caseId?: number | string;
  duration?: string; // e.g. '1h', '7d', etc.
  extra?: string;
  createdAt?: Date;
}

const typeToColor = {
  [ModLogType.Ban]: 0xED4245, // red
  [ModLogType.Warn]: 0xFAA81A, // orange
  [ModLogType.Mute]: 0x747F8D, // grey
  [ModLogType.Note]: 0xFEE75C, // yellow
  [ModLogType.NoteRemoved]: 0x57F287, // green
  [ModLogType.Unban]: 0x57F287, // green
  [ModLogType.Unwarn]: 0x57F287, // green
  [ModLogType.Unmute]: 0x57F287, // green
  [ModLogType.Kick]: 0x5865F2, // blue
  [ModLogType.Other]: 0x5865F2, // blue
};

const typeToEmoji = {
  [ModLogType.Warn]: '⚠️',
  [ModLogType.Unwarn]: '⚠️',
  [ModLogType.Mute]: '🔇',
  [ModLogType.Unmute]: '🔇',
  [ModLogType.Ban]: '🔨',
  [ModLogType.Unban]: '🔨',
  [ModLogType.Kick]: '👢',
  [ModLogType.Note]: '📝',
  [ModLogType.NoteRemoved]: '📝',
  [ModLogType.Other]: '🔷',
};

export async function sendModLog({
  guild,
  type,
  targetUserId,
  targetTag,
  moderatorId,
  moderatorTag,
  reason,
  caseId,
  duration,
  extra,
  createdAt
}: ModLogOptions) {
  if (!LOG_CHANNEL_ID) {
    container.logger.warn('MOD_LOG_CHANNEL_ID is not set in .env');
    return;
  }

  const channel = guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) {
    container.logger.warn(`Mod log channel not found or not a text channel in guild ${guild.id}`);
    return;
  }

  // Fetch user and moderator for avatars
  let targetUser: User | undefined;
  let moderatorUser: User | undefined;
  try {
    targetUser = await guild.client.users.fetch(targetUserId);
  } catch {}
  try {
    moderatorUser = await guild.client.users.fetch(moderatorId);
  } catch {}

  const fields = [
    { name: 'User', value: `<@${targetUserId}> (${targetTag})`, inline: true },
    { name: 'Moderator', value: `<@${moderatorId}> (${moderatorTag})`, inline: true },
  ];
  if (reason) fields.push({ name: 'Reason', value: reason, inline: false });
  if (duration) fields.push({ name: 'Duration', value: duration, inline: false });
  if (extra) fields.push({ name: 'Extra', value: extra, inline: false });

  // Add timestamp and case ID as their own fields
  const timestamp = createdAt ? createdAt : new Date();
  const unix = Math.floor(timestamp.getTime() / 1000);
  const dateString = `<t:${unix}:f>`; // Discord local time format
  fields.push({ name: 'Timestamp', value: dateString, inline: true });
  fields.push({ name: 'Case ID', value: `\`${caseId ?? 'N/A'}\``, inline: true });

  // Color
  let color = typeToColor[type] ?? 0x5865F2;
  // Green for any removal/un actions
  if (type.toLowerCase().startsWith('un') || type.toLowerCase().includes('remove')) color = 0x57F287;

  // Emoji
  const emoji = typeToEmoji[type] ?? '🔷';

  // Footer: only duration, if provided
  const footer = duration ? { text: `Duration: ${duration}` } : undefined;

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${type}`)
    .addFields(fields)
    .setColor(color)
    .setTimestamp(timestamp)
    .setThumbnail(targetUser?.displayAvatarURL({ size: 256 }) ?? null);

  if (footer) embed.setFooter(footer);
  if (moderatorUser) {
    embed.setAuthor({ name: `Moderator: ${moderatorTag}`, iconURL: moderatorUser.displayAvatarURL({ size: 128 }) ?? null });
  }

  await channel.send({ embeds: [embed] });
} 