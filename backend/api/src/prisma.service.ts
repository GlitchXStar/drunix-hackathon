import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // In Stage 0, connection will be established if database is reachable
    try {
      await this.$connect();
    } catch {
      // Allow app to boot in decoupled development/test modes
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
