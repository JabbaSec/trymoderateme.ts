import { escapeMarkdown } from 'discord.js';

export class InputSanitizer {
  /**
   * Sanitizes text input for safe display and storage
   */
  static sanitizeText(input: string, maxLength: number = 1024): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Sanitize mentions by adding backslashes before @ symbols
    let sanitized = input.replace(/@/g, '\\@');
    
    // Remove custom emojis but keep the text
    sanitized = sanitized.replace(/<a?:\w+:\d+>/g, '[emoji]');
    
    // Escape URLs but preserve Discord links
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, (match) => {
      // Preserve Discord links
      if (match.includes('discord.com/channels/') || 
          match.includes('discord.gg/') || 
          match.includes('cdn.discordapp.com/')) {
        return match;
      }
      // Escape other URLs
      return match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    
    // Escape markdown characters
    sanitized = escapeMarkdown(sanitized);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.slice(0, maxLength - 3) + '...';
    }
    
    return sanitized;
  }

  /**
   * Sanitizes user tags for safe display
   */
  static sanitizeUserTag(userTag: string): string {
    if (!userTag || typeof userTag !== 'string') {
      return 'Unknown User';
    }
    
    // Escape markdown in usernames
    return escapeMarkdown(userTag);
  }

  /**
   * Sanitizes guild names for safe display
   */
  static sanitizeGuildName(guildName: string | null): string {
    if (!guildName || typeof guildName !== 'string') {
      return 'Unknown Server';
    }
    
    // Escape markdown in guild names
    return escapeMarkdown(guildName);
  }

  /**
   * Validates and sanitizes numeric IDs
   */
  static validateId(id: number): { isValid: boolean; sanitizedId?: number } {
    if (typeof id !== 'number' || isNaN(id) || id <= 0 || id > 2147483647) {
      return { isValid: false };
    }
    
    return { isValid: true, sanitizedId: Math.floor(id) };
  }

  /**
   * Sanitizes content for database storage (less restrictive than display)
   */
  static sanitizeForStorage(input: string, maxLength: number = 1024): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Sanitize mentions by adding backslashes before @ symbols
    let sanitized = input.replace(/@/g, '\\@');
    
    // Remove custom emojis but keep the text
    sanitized = sanitized.replace(/<a?:\w+:\d+>/g, '[emoji]');
    
    // Keep URLs as-is for storage
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.slice(0, maxLength - 3) + '...';
    }
    
    return sanitized;
  }

  /**
   * Sanitizes content for logging (preserves more information)
   */
  static sanitizeForLogging(input: string, maxLength: number = 500): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Only escape markdown for logging, keep mentions and URLs
    let sanitized = escapeMarkdown(input);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length for logs
    if (sanitized.length > maxLength) {
      sanitized = sanitized.slice(0, maxLength - 3) + '...';
    }
    
    return sanitized;
  }
} 