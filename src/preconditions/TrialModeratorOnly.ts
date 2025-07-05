import { Precondition } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, GuildMember } from 'discord.js';
import { TrialModCheck } from '../lib/functions/permissions/TrialModCheck';
import { ModeratorCheck } from '../lib/functions/permissions/ModeratorCheck';
import { AdministratorCheck } from '../lib/functions/permissions/AdministratorCheck';
import { OwnerCheck } from '../lib/functions/permissions/OwnerCheck';

/**
 * Allows only users who have a trial moderator, moderator, administrator role, or are bot owners.
 */
export class TrialModeratorOnlyPrecondition extends Precondition {
  public override async messageRun(message: Message) {
    return this.check(message.member as GuildMember | null, message.author.id, message.guild?.ownerId);
  }

  public override async chatInputRun(interaction: CommandInteraction) {
    return this.check(interaction.member as GuildMember | null, interaction.user.id, interaction.guild?.ownerId);
  }

  public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
    return this.check(interaction.member as GuildMember | null, interaction.user.id, interaction.guild?.ownerId);
  }

  private async check(member: GuildMember | null, userId?: string, ownerId?: string) {
    if (!userId || !member || !ownerId) {
      return this.error({ message: 'This command can only be used in a server.', context: { flags: MessageFlags.Ephemeral } });
    }
    if (
      OwnerCheck(userId) ||
      ownerId === userId ||
      AdministratorCheck(member) ||
      ModeratorCheck(member) ||
      TrialModCheck(member)
    ) {
      return this.ok();
    }
    return this.error({ message: 'Only trial moderators, moderators, administrators, bot owners, or the server owner can use this command.', context: { flags: MessageFlags.Ephemeral } });
  }
} 