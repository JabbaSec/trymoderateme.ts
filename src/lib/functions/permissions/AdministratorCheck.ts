import type { GuildMember } from 'discord.js';

/**
 * Checks if the member has any of the administrator role IDs from the environment.
 * Usage: AdministratorCheck(member)
 */
export function AdministratorCheck(member: GuildMember): boolean {
  const env = process.env.ADMINISTRATOR_ROLE_IDS;
  if (!env) return false;
  const adminRoleIds = env.split(',').map((id) => id.trim()).filter(Boolean);
  return member.roles.cache.some((role) => adminRoleIds.includes(role.id));
} 