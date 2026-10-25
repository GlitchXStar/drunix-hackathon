import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function sanitizeDatabaseUrl(urlStr?: string): string | undefined {
  if (!urlStr) return undefined;
  try {
    const url = new URL(urlStr);
    if (
      (url.protocol === 'mongodb:' || url.protocol === 'mongodb+srv:') &&
      (url.pathname === '/' || url.pathname === '')
    ) {
      url.pathname = '/trustledger';
      if (!url.search) {
        url.search = '?retryWrites=true&w=majority';
      }
      return url.toString();
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const sanitizedUrl = sanitizeDatabaseUrl(process.env.DATABASE_URL);
    super(
      sanitizedUrl
        ? {
            datasources: {
              db: {
                url: sanitizedUrl,
              },
            },
          }
        : undefined,
    );
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to MongoDB database successfully');
    } catch (err: any) {
      this.logger.warn(`Prisma $connect notice: ${err?.message || err}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
