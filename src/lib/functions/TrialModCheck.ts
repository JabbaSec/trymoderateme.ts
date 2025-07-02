import type { GuildMember } from 'discord.js';

/**
 * Checks if the member has any of the trial moderator role IDs from the environment.
 * Usage: TrialModCheck(member)
 */
export function TrialModCheck(member: GuildMember): boolean {
  const env = process.env.TRIAL_MODERATOR_ROLE_IDS;
  if (!env) return false;
  const trialModRoleIds = env.split(',').map((id) => id.trim()).filter(Boolean);
  return member.roles.cache.some((role) => trialModRoleIds.includes(role.id));
} 