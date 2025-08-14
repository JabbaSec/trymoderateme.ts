import './lib/setup';

import { LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import { CustomLogger } from './lib/utils/logger';

const client = new SapphireClient({
	defaultPrefix: '!',
	caseInsensitiveCommands: true,
	
	logger: {
		level: LogLevel.Debug,
		instance: new CustomLogger(process.env.WEBHOOK_ID!, process.env.WEBHOOK_TOKEN!)
	},

	intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
	loadMessageCommandListeners: true
});

const main = async () => {
	try {
		client.logger.info(`Connecting to ${client.user?.username}`);
		await client.login();
		client.logger.info(`Successfully connected to ${client.user?.username}`);
	} catch (error) {
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};

void main();
