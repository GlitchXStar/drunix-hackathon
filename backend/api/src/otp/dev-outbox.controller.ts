import { Controller, Get, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Dev')
@Controller('dev')
export class DevOutboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('outbox')
  @ApiOperation({ summary: 'Inspect simulated OTP outbox messages (dev/test only)' })
  @ApiResponse({ status: 200, description: 'List of outbox messages' })
  async getOutbox() {
    const isDevOutboxEnabled = this.configService.get<string>('DEV_OUTBOX') === '1';
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (!isDevOutboxEnabled || nodeEnv === 'production') {
      throw new ForbiddenException('Dev outbox is disabled in this environment');
    }

    return this.prisma.devOutbox.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
