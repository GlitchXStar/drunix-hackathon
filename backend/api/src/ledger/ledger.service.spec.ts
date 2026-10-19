import { ConfigService } from '@nestjs/config';
import { InMemoryLedgerService } from './in-memory-ledger.service';
import { FabricLedgerService } from './fabric-ledger.service';
import { PrismaService } from '../prisma.service';

describe('Ledger Service Contract Suite (Stage 4)', () => {
  let mockPrisma: any;
  let inMemoryLedger: InMemoryLedgerService;
  let fabricLedger: FabricLedgerService;
  let configService: ConfigService;

  beforeEach(() => {
    mockPrisma = {
      ledgerTx: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    };

    configService = new ConfigService({
      DRUNIX_CHANNEL: 'trustledgerchannel',
      DRUNIX_CHAINCODE: 'trustledger',
      DRUNIX_PLATFORM_PEER_HOST: '127.0.0.1',
      DRUNIX_PLATFORM_PEER_PORT: '59999', // Closed port for offline test
      DRUNIX_BANKA_PEER_HOST: '127.0.0.1',
      DRUNIX_BANKA_PEER_PORT: '59998',
      DRUNIX_NBFC_PEER_HOST: '127.0.0.1',
      DRUNIX_NBFC_PEER_PORT: '59997',
    });

    inMemoryLedger = new InMemoryLedgerService(mockPrisma as PrismaService);
    fabricLedger = new FabricLedgerService(mockPrisma as PrismaService, configService);
  });

  describe('InMemoryLedgerService Contract Behaviors', () => {
    it('executes full document registration and access check flow', async () => {
      // 1. Register business
      await inMemoryLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-uuid-1');

      // 2. Register document
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'RegisterDocument',
        'doc-uuid-1',
        'biz-uuid-1',
        'GST_CERTIFICATE',
        'sha256-hash-value-1',
      );

      // 3. Create consent for BankAOrgMSP with 7-day expiry
      const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'CreateConsent',
        'consent-1',
        'biz-uuid-1',
        'BankAOrgMSP',
        'DOCUMENTS',
        JSON.stringify(['doc-uuid-1']),
        'KYC_CHECK',
        expiresAt,
        'evidence-hash-1',
      );

      // 4. CheckAccess as BankAOrgMSP
      const access = await inMemoryLedger.checkAccess(
        'consent-1',
        'BankAOrgMSP',
        'DOCUMENTS',
        'doc-uuid-1',
      );
      expect(access.allowed).toBe(true);
      expect(access.reasonCode).toBe('ACCESS_ALLOWED');
    });

    it('rejects CheckAccess when document is not in consent scope', async () => {
      await inMemoryLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-uuid-2');
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'RegisterDocument',
        'doc-in-scope',
        'biz-uuid-2',
        'GST',
        'hash1',
      );

      const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'CreateConsent',
        'consent-2',
        'biz-uuid-2',
        'BankAOrgMSP',
        'DOCUMENTS',
        JSON.stringify(['doc-in-scope']),
        'KYC',
        expiresAt,
        'ev-2',
      );

      // Check access for unapproved document
      const access = await inMemoryLedger.checkAccess(
        'consent-2',
        'BankAOrgMSP',
        'DOCUMENTS',
        'doc-out-of-scope',
      );
      expect(access.allowed).toBe(false);
      expect(access.reasonCode).toBe('DOC_NOT_IN_SCOPE');
    });

    it('rejects CheckAccess when consent has expired', async () => {
      await inMemoryLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-uuid-3');
      const expiredTime = new Date(Date.now() - 10000).toISOString();
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'CreateConsent',
        'consent-expired',
        'biz-uuid-3',
        'BankAOrgMSP',
        'DOCUMENTS',
        JSON.stringify(['doc-uuid-1']),
        'KYC',
        expiredTime,
        'ev-3',
      );

      const access = await inMemoryLedger.checkAccess(
        'consent-expired',
        'BankAOrgMSP',
        'DOCUMENTS',
        'doc-uuid-1',
      );
      expect(access.allowed).toBe(false);
      expect(access.reasonCode).toBe('CONSENT_EXPIRED');
    });

    it('rejects CheckAccess when institution is suspended', async () => {
      await inMemoryLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-uuid-1');
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'RegisterDocument',
        'doc-uuid-1',
        'biz-uuid-1',
        'GST',
        'hash1',
      );

      // Suspend BankA
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'SetInstitutionStatus',
        'BankA',
        'SUSPENDED',
      );

      const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
      await inMemoryLedger.submitTransaction(
        'PlatformOrgMSP',
        'CreateConsent',
        'consent-susp',
        'biz-uuid-1',
        'BankAOrgMSP',
        'DOCUMENTS',
        JSON.stringify(['doc-uuid-1']),
        'KYC',
        expiresAt,
        'ev-4',
      );

      const access = await inMemoryLedger.checkAccess(
        'consent-susp',
        'BankAOrgMSP',
        'DOCUMENTS',
        'doc-uuid-1',
      );
      expect(access.allowed).toBe(false);
      expect(access.reasonCode).toBe('INSTITUTION_SUSPENDED');
    });

    it('enforces I-1 fail-closed when ledger is unreachable', async () => {
      inMemoryLedger.setHealthy(false);
      expect(await inMemoryLedger.isHealthy()).toBe(false);

      await expect(
        inMemoryLedger.checkAccess('any-consent', 'BankAOrgMSP', 'DOCUMENTS', 'any-doc'),
      ).rejects.toThrow('LEDGER_UNAVAILABLE');

      await expect(
        inMemoryLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-fail'),
      ).rejects.toThrow('LEDGER_UNAVAILABLE');
    });

    it('records transaction metrics with latency to LedgerTx', async () => {
      await inMemoryLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-metric');
      expect(mockPrisma.ledgerTx.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            chaincodeFunction: 'RegisterBusiness',
            status: 'SUCCESS',
            latencyMs: expect.any(Number),
          }),
        }),
      );
    });
  });

  describe('FabricLedgerService Contract Behaviors & Fail-Closed (I-1)', () => {
    it('reports unhealthy when Drunix peer endpoint is offline', async () => {
      const healthy = await fabricLedger.isHealthy();
      expect(healthy).toBe(false);
    });

    it('fails closed (I-1) throwing LEDGER_UNAVAILABLE on offline network', async () => {
      await expect(
        fabricLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-test'),
      ).rejects.toThrow('LEDGER_UNAVAILABLE');

      await expect(
        fabricLedger.checkAccess('consent-1', 'BankAOrgMSP', 'DOCUMENTS', 'doc-1'),
      ).rejects.toThrow('LEDGER_UNAVAILABLE');
    });

    it('records FAILED transaction metric in LedgerTx on connection error', async () => {
      try {
        await fabricLedger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', 'biz-test');
      } catch {
        // Expected
      }

      expect(mockPrisma.ledgerTx.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            chaincodeFunction: 'RegisterBusiness',
            status: 'FAILED',
            latencyMs: expect.any(Number),
          }),
        }),
      );
    });
  });
});
