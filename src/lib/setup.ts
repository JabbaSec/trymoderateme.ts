// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import { ApplicationCommandRegistries, RegisterBehavior, container } from '@sapphire/framework';
import '@sapphire/plugin-logger/register';
import { setup } from '@skyra/env-utilities';
import * as colorette from 'colorette';
import { join } from 'node:path';
import { srcDir } from './constants';

import { PrismaClient } from '@prisma/client';

// Set default behavior to bulk overwrite
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

const prisma = new PrismaClient();
container.prisma = prisma;

declare module '@sapphire/pieces' {
	interface Container {
		prisma: typeof prisma;
	}
}

// Read env var
setup({ path: join(srcDir, '.env') });

// Enable colorette
colorette.createColors({ useColor: true });
