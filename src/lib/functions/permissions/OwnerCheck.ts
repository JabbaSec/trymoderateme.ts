/**
 * Checks if the user is the bot owner (by user ID from env).
 * Usage: OwnerCheck(userId)
 */
export function OwnerCheck(userId: string): boolean {
  const env = process.env.BOT_OWNER_IDS;
  if (!env) return false;
  const ownerIds = env.split(',').map((id) => id.trim()).filter(Boolean);
  return ownerIds.includes(userId);
} 