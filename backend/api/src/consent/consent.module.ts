import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditModule } from '../audit/audit.module';
import { OtpModule } from '../otp/otp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ShareCodeService } from './share-code.service';
import { RequestsService } from './requests.service';
import { ConsentService } from './consent.service';
import { ReconcilerService } from './reconciler.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { BusinessConsentController } from './business-consent.controller';
import { InstitutionConsentController } from './institution-consent.controller';

@Module({
  imports: [AuditModule, OtpModule, NotificationsModule, LedgerModule],
  controllers: [BusinessConsentController, InstitutionConsentController],
  providers: [
    PrismaService,
    ShareCodeService,
    RequestsService,
    ConsentService,
    ReconcilerService,
    IdempotencyService,
  ],
  exports: [
    ShareCodeService,
    RequestsService,
    ConsentService,
    ReconcilerService,
    IdempotencyService,
  ],
})
export class ConsentModule {}
