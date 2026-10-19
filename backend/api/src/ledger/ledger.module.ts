import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { LEDGER_SERVICE } from './ledger.interface';
import { InMemoryLedgerService } from './in-memory-ledger.service';
import { FabricLedgerService } from './fabric-ledger.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    PrismaService,
    InMemoryLedgerService,
    FabricLedgerService,
    {
      provide: LEDGER_SERVICE,
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        const ledgerType = config.get<string>('LEDGER_TYPE', 'in-memory');
        if (ledgerType === 'fabric') {
          return new FabricLedgerService(prisma, config);
        }
        return new InMemoryLedgerService(prisma);
      },
      inject: [PrismaService, ConfigService],
    },
  ],
  exports: [LEDGER_SERVICE, InMemoryLedgerService, FabricLedgerService],
})
export class LedgerModule {}
