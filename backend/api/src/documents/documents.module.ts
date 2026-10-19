import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  imports: [AuditModule, StorageModule, LedgerModule],
  controllers: [DocumentsController],
  providers: [PrismaService, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
