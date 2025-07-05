import type { GuildMember } from 'discord.js';

/**
 * Checks if the member has any of the moderator role IDs from the environment.
 * Usage: ModeratorCheck(member)
 */
export function ModeratorCheck(member: GuildMember): boolean {
  const env = process.env.MODERATOR_ROLE_IDS;
  if (!env) return false;
  const modRoleIds = env.split(',').map((id) => id.trim()).filter(Boolean);
  return member.roles.cache.some((role) => modRoleIds.includes(role.id));
} 