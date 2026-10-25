import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Inject,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { LEDGER_SERVICE, LedgerService } from './ledger.interface';

@ApiTags('Ledger Explorer & Observability')
@Controller('ledger')
@UseGuards(SessionGuard)
export class LedgerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get ledger network status and provider metadata' })
  @ApiResponse({ status: 200, description: 'Ledger network status' })
  async getStatus() {
    const isHealthy = await this.ledgerService.isHealthy();
    const ledgerType = this.config.get<string>('LEDGER_TYPE', 'in-memory');
    const isSimulated = ledgerType !== 'fabric';
    const channelId = this.config.get<string>('DRUNIX_CHANNEL', 'trustledgerchannel');
    const chaincodeId = this.config.get<string>('DRUNIX_CHAINCODE', 'trustledger');

    const [totalTransactions, lastTx] = await Promise.all([
      this.prisma.ledgerTx.count(),
      this.prisma.ledgerTx.findFirst({
        orderBy: { at: 'desc' },
      }),
    ]);

    const peers = isSimulated
      ? [
          { mspId: 'PlatformOrgMSP', name: 'TrustLedger Platform', role: 'Ordering & Platform Peer', status: 'ONLINE' },
          { mspId: 'BankAOrgMSP', name: 'Bank A Commercial Lending', role: 'Validator & Anchor Peer', status: 'ONLINE' },
          { mspId: 'NbfcOrgMSP', name: 'NBFC Growth Capital', role: 'Validator & Anchor Peer', status: 'ONLINE' },
        ]
      : [
          { mspId: 'PlatformOrgMSP', name: 'TrustLedger Platform', role: 'Peer: 127.0.0.1:7051', status: isHealthy ? 'ONLINE' : 'DEGRADED' },
          { mspId: 'BankAOrgMSP', name: 'Bank A Commercial Lending', role: 'Peer: 127.0.0.1:9051', status: isHealthy ? 'ONLINE' : 'DEGRADED' },
          { mspId: 'NbfcOrgMSP', name: 'NBFC Growth Capital', role: 'Peer: 127.0.0.1:11051', status: isHealthy ? 'ONLINE' : 'DEGRADED' },
        ];

    return {
      provider: isSimulated ? 'Simulated Ledger — In-Memory Provider' : 'Drunix Fabric Enterprise Ledger',
      ledgerType,
      isSimulated,
      status: isHealthy ? 'ONLINE' : 'DEGRADED',
      channelId,
      chaincodeId,
      totalTransactions,
      lastTxId: lastTx?.txId || null,
      lastTxAt: lastTx?.at || null,
      peers,
      consensusModel: isSimulated ? 'Deterministic In-Memory Raft Simulator' : 'Raft Consensus (3-node HA)',
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List immutable ledger transactions' })
  @ApiResponse({ status: 200, description: 'List of recorded ledger transactions' })
  async listTransactions(@Query('limit') limitStr?: string) {
    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 100);
    const txs = await this.prisma.ledgerTx.findMany({
      take: limit,
      orderBy: { at: 'desc' },
      select: {
        id: true,
        txId: true,
        chaincodeFunction: true,
        status: true,
        latencyMs: true,
        at: true,
      },
    });

    return txs.map((tx) => {
      // Deduce acting MSP safely from function
      let estimatedMsp = 'PlatformOrgMSP';
      if (['CreateConsent', 'RevokeConsent'].includes(tx.chaincodeFunction)) {
        estimatedMsp = 'PlatformOrgMSP';
      } else if (['IssueAttestation', 'UpdateAttestationStatus'].includes(tx.chaincodeFunction)) {
        estimatedMsp = 'BankAOrgMSP';
      } else if (['RecordAccessEvent', 'CheckAccess'].includes(tx.chaincodeFunction)) {
        estimatedMsp = 'BankAOrgMSP';
      } else if (['RegisterDocument'].includes(tx.chaincodeFunction)) {
        estimatedMsp = 'PlatformOrgMSP';
      }

      return {
        ...tx,
        mspId: estimatedMsp,
      };
    });
  }

  @Get('transactions/:txId')
  @ApiOperation({ summary: 'Get transaction details safely without sensitive data' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  async getTransaction(@Param('txId') txId: string) {
    const tx = await this.prisma.ledgerTx.findFirst({
      where: { txId },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found on ledger');
    }

    return {
      id: tx.id,
      txId: tx.txId,
      chaincodeFunction: tx.chaincodeFunction,
      status: tx.status,
      latencyMs: tx.latencyMs,
      timestamp: tx.at,
      channel: this.config.get<string>('DRUNIX_CHANNEL', 'trustledgerchannel'),
      chaincode: this.config.get<string>('DRUNIX_CHAINCODE', 'trustledger'),
      validationCode: 'VALID',
    };
  }
}
