import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtpService } from './otp.service';
import { DevOutboxProvider } from './dev-outbox.provider';
import { DevOutboxController } from './dev-outbox.controller';
import { OTP_DELIVERY_PROVIDER } from './otp.interface';
import { PrismaService } from '../prisma.service';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [ConfigModule, AuditModule],
  controllers: [DevOutboxController],
  providers: [
    OtpService,
    PrismaService,
    DevOutboxProvider,
    {
      provide: OTP_DELIVERY_PROVIDER,
      useExisting: DevOutboxProvider,
    },
  ],
  exports: [OtpService, OTP_DELIVERY_PROVIDER],
})
export class OtpModule {}
