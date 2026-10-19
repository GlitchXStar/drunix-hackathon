import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  STORAGE_PROVIDER,
  KEY_PROVIDER,
  StorageProvider,
  KeyProvider,
} from '../storage/storage.interface';
import { LEDGER_SERVICE, LedgerService } from '../ledger/ledger.interface';
import { EnvKeyProvider } from '../storage/key.provider';

describe('DocumentsService (Stage 4)', () => {
  let service: DocumentsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockStorage: StorageProvider;
  let keyProvider: KeyProvider;
  let mockLedger: LedgerService;

  const storageMap = new Map<string, Buffer>();
  const dbDocuments = new Map<string, any>();
  const dbConsents = new Map<string, any>();

  const testBusinessId = 'biz-db-id-123';
  const testBusinessRef = 'biz-ref-uuid-123';

  beforeEach(async () => {
    storageMap.clear();
    dbDocuments.clear();
    dbConsents.clear();

    const configService = new ConfigService({
      MASTER_KEY: 'test-master-key-for-documents-service-32b',
    });
    keyProvider = new EnvKeyProvider(configService);

    mockStorage = {
      store: jest.fn().mockImplementation(async (key: string, data: Buffer) => {
        storageMap.set(key, Buffer.from(data));
      }),
      retrieve: jest.fn().mockImplementation(async (key: string) => {
        const found = storageMap.get(key);
        if (!found) throw new Error('Not found in storage');
        return Buffer.from(found);
      }),
      delete: jest.fn().mockImplementation(async (key: string) => {
        storageMap.delete(key);
      }),
      exists: jest.fn().mockImplementation(async (key: string) => {
        return storageMap.has(key);
      }),
    };

    mockPrisma = {
      business: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testBusinessId) {
            return {
              id: testBusinessId,
              businessRef: testBusinessRef,
              legalName: 'Acme Enterprises Ltd',
            };
          }
          return null;
        }),
      },
      document: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const doc = {
            id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          dbDocuments.set(doc.id, doc);
          dbDocuments.set(doc.docRef, doc);
          return doc;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.docRef) return dbDocuments.get(where.docRef) || null;
          if (where.id) return dbDocuments.get(where.id) || null;
          return null;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const doc of dbDocuments.values()) {
            if (doc.id === where.id && (!where.businessId || doc.businessId === where.businessId)) {
              return doc;
            }
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          return Array.from(dbDocuments.values()).filter((d) => d.status !== 'DELETED');
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = dbDocuments.get(where.id);
          if (!existing) throw new NotFoundException('Document not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          dbDocuments.set(existing.id, updated);
          dbDocuments.set(existing.docRef, updated);
          return updated;
        }),
      },
      consentGrant: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          const docRefTarget = where.docRefs?.has;
          for (const consent of dbConsents.values()) {
            if (
              consent.status === 'ACTIVE' &&
              new Date(consent.expiresAt) > new Date() &&
              consent.docRefs.includes(docRefTarget)
            ) {
              return consent;
            }
          }
          return null;
        }),
      },
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockLedger = {
      submitTransaction: jest.fn().mockResolvedValue('tx-ledger-success-123'),
      evaluateTransaction: jest.fn().mockResolvedValue(''),
      checkAccess: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ACCESS_ALLOWED' }),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: KEY_PROVIDER, useValue: keyProvider },
        { provide: LEDGER_SERVICE, useValue: mockLedger },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('Upload Pipeline (Section 7 & W1)', () => {
    it('encrypts file, registers on ledger, and stores ciphertext in StorageProvider', async () => {
      const plaintext = Buffer.from('%PDF-1.7\nSample confidential MSME invoice data');
      const uploadFile = {
        buffer: plaintext,
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        size: plaintext.length,
      };

      const result = await service.uploadDocument(
        testBusinessId,
        'GST_CERTIFICATE',
        uploadFile,
        'owner@example.com',
      );

      expect(result.id).toBeDefined();
      expect(result.docRef).toBeDefined();
      expect(result.status).toBe('REGISTERED');
      expect(result.version).toBe(1);

      // Verify stored ciphertext is NOT plaintext (envelope encryption D-2)
      const doc = dbDocuments.get(result.id);
      expect(doc.storageKey).toBeDefined();
      const storedCiphertext = storageMap.get(doc.storageKey);
      expect(storedCiphertext).toBeDefined();
      expect(storedCiphertext?.equals(plaintext)).toBe(false);

      // Verify ledger registration was called with salted hash
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'RegisterDocument',
        result.docRef,
        testBusinessRef,
        'GST_CERTIFICATE',
        result.contentHash,
      );

      // Verify audit record
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_UPLOADED',
          entityType: 'Document',
          entityId: result.id,
        }),
      );
    });

    it('rejects upload with invalid magic bytes (S-13)', async () => {
      const badFile = {
        buffer: Buffer.from('Plain text file masquerading as a PDF'),
        originalname: 'bad.pdf',
        mimetype: 'application/pdf',
        size: 38,
      };

      await expect(
        service.uploadDocument(testBusinessId, 'GST_CERTIFICATE', badFile, 'owner@example.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Release Pipeline & Tamper Detection (Section 7, I-1, S-9)', () => {
    let uploadedDoc: any;
    const originalPdf = Buffer.from('%PDF-1.7\nConfidential Bank Statement for KYC');

    beforeEach(async () => {
      uploadedDoc = await service.uploadDocument(
        testBusinessId,
        'BANK_STATEMENT',
        {
          buffer: originalPdf,
          originalname: 'statement.pdf',
          mimetype: 'application/pdf',
          size: originalPdf.length,
        },
        'owner@example.com',
      );
    });

    it('releases decrypted document when ledger allows and integrity matches', async () => {
      const releaseResult = await service.releaseDocumentForSession(
        'consent-123',
        'BankAOrgMSP',
        uploadedDoc.docRef,
      );

      expect(releaseResult.buffer.equals(originalPdf)).toBe(true);
      expect(releaseResult.mime).toBe('application/pdf');
      expect(releaseResult.docRef).toBe(uploadedDoc.docRef);
    });

    it('denies access and logs INTEGRITY_MISMATCH when ciphertext in storage is modified (S-9)', async () => {
      const docRecord = dbDocuments.get(uploadedDoc.id);
      const originalCiphertext = storageMap.get(docRecord.storageKey)!;

      // Tamper with ciphertext by corrupting bytes
      const tamperedCiphertext = Buffer.from(originalCiphertext);
      tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;
      storageMap.set(docRecord.storageKey, tamperedCiphertext);

      await expect(
        service.releaseDocumentForSession('consent-123', 'BankAOrgMSP', uploadedDoc.docRef),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INTEGRITY_MISMATCH',
          entityType: 'Document',
          entityId: uploadedDoc.docRef,
        }),
      );
    });

    it('fails closed (I-1) throwing LEDGER_UNAVAILABLE if ledger is unreachable', async () => {
      (mockLedger.checkAccess as jest.Mock).mockRejectedValueOnce(
        new Error('LEDGER_UNAVAILABLE: network down'),
      );

      await expect(
        service.releaseDocumentForSession('consent-123', 'BankAOrgMSP', uploadedDoc.docRef),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies access if ledger CheckAccess returns allowed: false', async () => {
      (mockLedger.checkAccess as jest.Mock).mockResolvedValueOnce({
        allowed: false,
        reasonCode: 'CONSENT_EXPIRED',
      });

      await expect(
        service.releaseDocumentForSession('consent-123', 'BankAOrgMSP', uploadedDoc.docRef),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Active Consent Protection (D-12 & S-14)', () => {
    let uploadedDoc: any;

    beforeEach(async () => {
      uploadedDoc = await service.uploadDocument(
        testBusinessId,
        'FINANCIAL_STATEMENT',
        {
          buffer: Buffer.from('%PDF-1.7\nAnnual Accounts 2025'),
          originalname: 'accounts.pdf',
          mimetype: 'application/pdf',
          size: 32,
        },
        'owner@example.com',
      );
    });

    it('blocks replacement (HTTP 409) if an active consent references the document (D-12, S-14)', async () => {
      // Simulate active consent referencing this docRef
      dbConsents.set('consent-active', {
        id: 'c-1',
        consentId: 'consent-active',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86400 * 1000),
        docRefs: [uploadedDoc.docRef],
      });

      const newPdf = {
        buffer: Buffer.from('%PDF-1.7\nUpdated Annual Accounts 2025 v2'),
        originalname: 'accounts-v2.pdf',
        mimetype: 'application/pdf',
        size: 38,
      };

      await expect(
        service.replaceDocument(testBusinessId, uploadedDoc.id, newPdf, 'owner@example.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks deletion (HTTP 409) if an active consent references the document (D-12, S-14)', async () => {
      dbConsents.set('consent-active', {
        id: 'c-1',
        consentId: 'consent-active',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86400 * 1000),
        docRefs: [uploadedDoc.docRef],
      });

      await expect(
        service.deleteDocument(testBusinessId, uploadedDoc.id, 'owner@example.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('allows replacement when no active consent exists, creating version n+1', async () => {
      const newPdf = {
        buffer: Buffer.from('%PDF-1.7\nUpdated Annual Accounts 2025 v2'),
        originalname: 'accounts-v2.pdf',
        mimetype: 'application/pdf',
        size: 38,
      };

      const replaced = await service.replaceDocument(
        testBusinessId,
        uploadedDoc.id,
        newPdf,
        'owner@example.com',
      );

      expect(replaced.version).toBe(2);
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'ReplaceDocument',
        uploadedDoc.docRef,
        replaced.contentHash,
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_REPLACED',
          entityType: 'Document',
        }),
      );
    });

    it('allows deletion via crypto-shredding when no active consent exists', async () => {
      const docRecord = dbDocuments.get(uploadedDoc.id);
      const oldStorageKey = docRecord.storageKey;

      const deleteRes = await service.deleteDocument(
        testBusinessId,
        uploadedDoc.id,
        'owner@example.com',
      );

      expect(deleteRes.success).toBe(true);

      // Verify crypto-shredding:
      // 1. Ciphertext deleted from storage
      expect(storageMap.has(oldStorageKey)).toBe(false);

      // 2. Wrapped DEK and salt shredded in DB
      const updatedDoc = dbDocuments.get(uploadedDoc.id);
      expect(updatedDoc.status).toBe('DELETED');
      expect(updatedDoc.wrappedDek).toBe('');
      expect(updatedDoc.salt).toBe('');
      expect(updatedDoc.deletedAt).toBeDefined();

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_DELETED',
          entityType: 'Document',
          metadata: expect.objectContaining({ cryptoShredded: true }),
        }),
      );
    });
  });

  describe('Owner Direct View Pipeline', () => {
    it('allows business owner to view their own decrypted document', async () => {
      const content = Buffer.from('%PDF-1.7\nOwner view test content');
      const doc = await service.uploadDocument(
        testBusinessId,
        'PAN_CARD',
        {
          buffer: content,
          originalname: 'pan.pdf',
          mimetype: 'application/pdf',
          size: content.length,
        },
        'owner@example.com',
      );

      const viewResult = await service.viewDocumentByOwner(testBusinessId, doc.id);
      expect(viewResult.buffer.equals(content)).toBe(true);
      expect(viewResult.mime).toBe('application/pdf');
    });
  });

  describe('Failure Recovery & Reconciliation (Stage 4 Audit)', () => {
    it('cleans up orphaned ciphertext from storage if database creation fails', async () => {
      mockPrisma.document.create.mockRejectedValueOnce(new Error('DB_DEADLOCK_ERROR'));

      const file = {
        buffer: Buffer.from('%PDF-1.7\nOrphan test content'),
        originalname: 'orphan.pdf',
        mimetype: 'application/pdf',
        size: 30,
      };

      await expect(
        service.uploadDocument(testBusinessId, 'GST_CERTIFICATE', file, 'owner@example.com'),
      ).rejects.toThrow('DB_DEADLOCK_ERROR');

      // Verify no orphaned objects remained in storage
      expect(mockStorage.delete).toHaveBeenCalled();
      expect(storageMap.size).toBe(0);
    });

    it('denies release if document is still PENDING_REGISTRATION (W1)', async () => {
      // Mock ledger failure on initial upload so doc stays PENDING_REGISTRATION
      (mockLedger.submitTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('Chaincode timeout on commit'),
      );

      let pendingDocId = '';
      try {
        await service.uploadDocument(
          testBusinessId,
          'GST_CERTIFICATE',
          {
            buffer: Buffer.from('%PDF-1.7\nPending document'),
            originalname: 'pending.pdf',
            mimetype: 'application/pdf',
            size: 30,
          },
          'owner@example.com',
        );
      } catch {
        // Expected upload rejection due to ledger failure
      }

      // Find doc in db
      const doc = Array.from(dbDocuments.values()).find((d) => d.status === 'PENDING_REGISTRATION');
      expect(doc).toBeDefined();
      pendingDocId = doc.id;

      // Attempt release -> must be denied with DOCUMENT_NOT_READY (W1)
      await expect(
        service.releaseDocumentForSession('consent-1', 'BankAOrgMSP', doc.docRef),
      ).rejects.toThrow(ForbiddenException);

      // Now retry registration
      (mockLedger.submitTransaction as jest.Mock).mockResolvedValueOnce('tx-retry-success');
      const retryResult = await service.retryRegistration(testBusinessId, pendingDocId, 'owner@example.com');
      expect(retryResult.status).toBe('REGISTERED');

      // Now release succeeds
      const releaseResult = await service.releaseDocumentForSession('consent-1', 'BankAOrgMSP', doc.docRef);
      expect(releaseResult.buffer).toBeDefined();
    });

    it('handles idempotent retry when ledger already committed before DB failure', async () => {
      // Create pending document
      const doc = {
        id: 'doc-pending-id-99',
        docRef: 'doc-ref-99',
        businessId: testBusinessId,
        docType: 'GST_CERTIFICATE',
        status: 'PENDING_REGISTRATION',
        storageKey: 'sk-99',
        contentHash: 'hash-99',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      dbDocuments.set(doc.id, doc);
      dbDocuments.set(doc.docRef, doc);

      // Ledger throws already registered
      (mockLedger.submitTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('document doc-ref-99 already registered with identical contentHash (duplicate registration)'),
      );

      const retryResult = await service.retryRegistration(testBusinessId, doc.id, 'owner@example.com');
      expect(retryResult.status).toBe('REGISTERED');
      expect(dbDocuments.get(doc.id).status).toBe('REGISTERED');
    });
  });
});
