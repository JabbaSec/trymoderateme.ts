import { Precondition } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { OwnerCheck } from '../lib/functions/permissions/OwnerCheck';

/**
 * Allows only users who are bot owners (from BOT_OWNER_IDS env).
 */
export class OwnerOnlyPrecondition extends Precondition {
  public override async messageRun(message: Message) {
    return this.check(message.author.id);
  }

  public override async chatInputRun(interaction: CommandInteraction) {
    return this.check(interaction.user.id);
  }

  public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
    return this.check(interaction.user.id);
  }

  private async check(userId?: string) {
    if (!userId) {
      return this.error({ message: 'This command can only be used in a server.', context: { flags: MessageFlags.Ephemeral } });
    }
    if (OwnerCheck(userId)) {
      return this.ok();
    }
    return this.error({ message: 'Only the bot owner(s) can use this command.', context: { flags: MessageFlags.Ephemeral } });
  }
} 