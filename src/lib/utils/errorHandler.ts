import { container } from '@sapphire/framework';

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

export class ModerationErrorHandler {
  /**
   * Validates if an ID is within valid range for database operations
   */
  static validateId(id: number): ValidationResult {
    if (id <= 0 || id > 2147483647) { // Max 32-bit integer
      return {
        isValid: false,
        errorMessage: 'Invalid ID. Please provide a valid positive number.'
      };
    }
    return { isValid: true };
  }

  /**
   * Handles Prisma errors and returns user-friendly messages
   */
  static handlePrismaError(err: unknown, action: string, id?: number): string {
    container.logger.error(`Failed to ${action}: ${err}`);

    if (err instanceof Error) {
      if (err.message.includes('ConversionError') || err.message.includes('Unable to fit integer')) {
        return 'Invalid ID. The ID number is too large.';
      }
      if (err.message.includes('Record to delete does not exist')) {
        return `No ${action} found with ID ${id}.`;
      }
      if (err.message.includes('Unique constraint')) {
        return 'This record already exists.';
      }
      if (err.message.includes('Foreign key constraint')) {
        return 'Referenced record does not exist.';
      }
    }

    return `An unexpected error occurred while ${action}.`;
  }

  /**
   * Validates guild context
   */
  static validateGuildContext(guild: any, action: string): ValidationResult {
    if (!guild) {
      container.logger.warn(`Tried to ${action} outside a guild.`);
      return {
        isValid: false,
        errorMessage: 'This command can only be used in a server.'
      };
    }
    return { isValid: true };
  }

  /**
   * Validates if a record belongs to the current guild
   */
  static validateGuildOwnership(recordGuildId: string, currentGuildId: string, recordType: string): ValidationResult {
    if (recordGuildId !== currentGuildId) {
      container.logger.warn(`Tried to access ${recordType} from different guild. Record guild: ${recordGuildId}, Current guild: ${currentGuildId}`);
      return {
        isValid: false,
        errorMessage: `This ${recordType} does not belong to this server.`
      };
    }
    return { isValid: true };
  }

  /**
   * Validates user targets (prevents self/bot actions)
   */
  static validateTarget(targetUserId: string, moderatorId: string, targetUser: any, action: string): ValidationResult {
    if (targetUserId === moderatorId || targetUser.bot) {
      return {
        isValid: false,
        errorMessage: `You cannot ${action} yourself or a bot.`
      };
    }
    return { isValid: true };
  }
} 