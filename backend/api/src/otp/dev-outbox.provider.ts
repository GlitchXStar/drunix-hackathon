import { Injectable, Logger } from '@nestjs/common';
import { OtpDeliveryProvider, OtpDeliveryPayload } from './otp.interface';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DevOutboxProvider implements OtpDeliveryProvider {
  private readonly logger = new Logger(DevOutboxProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async deliver(payload: OtpDeliveryPayload): Promise<void> {
    try {
      await this.prisma.devOutbox.create({
        data: {
          channel: 'SMS/EMAIL',
          recipient: payload.to,
          body: `TrustLedger OTP for ${payload.purpose}: ${payload.code} (Challenge ID: ${payload.challengeId})`,
          createdAt: new Date(),
        },
      });
      this.logger.log(`[DevOutbox] Delivered OTP to ${payload.to} for challenge ${payload.challengeId}`);
    } catch (err) {
      this.logger.warn(`Failed to write to DevOutbox: ${(err as Error).message}`);
    }
  }
}
