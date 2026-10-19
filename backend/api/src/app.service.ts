import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'trustledger-api',
      version: '1.0.0',
      database: 'mongodb-prisma',
    };
  }
}
