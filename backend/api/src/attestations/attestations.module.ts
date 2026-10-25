import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgerModule } from '../ledger/ledger.module';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AttestationsService } from './attestations.service';
import { InstitutionAttestationsController } from './institution-attestations.controller';
import { BusinessAttestationsController } from './business-attestations.controller';

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    LedgerModule,
  ],
  controllers: [
    InstitutionAttestationsController,
    BusinessAttestationsController,
  ],
  providers: [
    PrismaService,
    IdempotencyService,
    AttestationsService,
  ],
  exports: [
    AttestationsService,
  ],
})
export class AttestationsModule {}
