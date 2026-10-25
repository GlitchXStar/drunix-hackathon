import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditModule } from '../audit/audit.module';
import { OtpModule } from '../otp/otp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentRendererService } from './document-renderer.service';
import { SessionSweeperService } from './session-sweeper.service';
import { SessionsService } from './sessions.service';
import { InstitutionSessionsController } from './institution-sessions.controller';

@Module({
  imports: [
    AuditModule,
    OtpModule,
    NotificationsModule,
    LedgerModule,
    DocumentsModule,
  ],
  controllers: [InstitutionSessionsController],
  providers: [
    PrismaService,
    DocumentRendererService,
    SessionSweeperService,
    SessionsService,
  ],
  exports: [
    SessionsService,
    SessionSweeperService,
    DocumentRendererService,
  ],
})
export class SessionsModule {}
