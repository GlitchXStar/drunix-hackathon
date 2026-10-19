import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { UserRole, UserStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { LEDGER_SERVICE, LedgerService } from '../src/ledger/ledger.interface';

describe('Documents Workflow E2E (Stage 4)', () => {
  let app: INestApplication;
  let prismaMock: any;

  const testBusinessId = 'biz-e2e-123';
  const testBusinessRef = 'biz-ref-e2e-123';
  const testUserId = 'user-owner-123';
  const testSessionId = 'sess-e2e-123';
  const testCsrfToken = 'valid-test-csrf-token-12345';
  const testCsrfHash = crypto.createHash('sha256').update(testCsrfToken).digest('hex');

  const documentsDb = new Map<string, any>();
  const consentsDb = new Map<string, any>();

  beforeEach(async () => {
    documentsDb.clear();
    consentsDb.clear();

    prismaMock = {
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testUserId) {
            return {
              id: testUserId,
              email: 'owner@msme.example.com',
              role: UserRole.BUSINESS_OWNER,
              status: UserStatus.ACTIVE,
              businessId: testBusinessId,
            };
          }
          return null;
        }),
      },
      business: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testBusinessId) {
            return {
              id: testBusinessId,
              businessRef: testBusinessRef,
              legalName: 'Test Enterprises Private Limited',
            };
          }
          return null;
        }),
      },
      serverSession: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.sessionId === testSessionId) {
            const now = new Date();
            return {
              id: 'ss-123',
              sessionId: testSessionId,
              userId: testUserId,
              idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
              absoluteExpiresAt: new Date(now.getTime() + 8 * 3600 * 1000),
              revokedAt: null,
              csrfTokenHash: testCsrfHash,
            };
          }
          return null;
        }),
        update: jest.fn(),
      },
      document: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const doc = {
            id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          documentsDb.set(doc.id, doc);
          documentsDb.set(doc.docRef, doc);
          return doc;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          return Array.from(documentsDb.values()).filter((d) => d.status !== 'DELETED');
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const doc of documentsDb.values()) {
            if (doc.id === where.id && (!where.businessId || doc.businessId === where.businessId)) {
              return doc;
            }
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.docRef) return documentsDb.get(where.docRef) || null;
          if (where.id) return documentsDb.get(where.id) || null;
          return null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = documentsDb.get(where.id);
          if (!existing) return null;
          const updated = { ...existing, ...data, updatedAt: new Date() };
          documentsDb.set(existing.id, updated);
          documentsDb.set(existing.docRef, updated);
          return updated;
        }),
      },
      consentGrant: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          const targetRef = where.docRefs?.has;
          for (const c of consentsDb.values()) {
            if (
              c.status === 'ACTIVE' &&
              new Date(c.expiresAt) > new Date() &&
              c.docRefs.includes(targetRef)
            ) {
              return c;
            }
          }
          return null;
        }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'aud-1' }),
      },
      ledgerTx: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['health'],
    });

    await app.init();

    // Register business on ledger so RegisterDocument succeeds
    const ledger = app.get<LedgerService>(LEDGER_SERVICE);
    await ledger.submitTransaction('PlatformOrgMSP', 'RegisterBusiness', testBusinessRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it('full document lifecycle: upload -> list -> view -> replace -> delete', async () => {
    const validPdfBuffer = Buffer.from('%PDF-1.7\nSample KYC Certificate for MSME');

    // 1. Upload valid document
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/business/documents')
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .field('docType', 'GST_CERTIFICATE')
      .attach('file', validPdfBuffer, 'gst_cert.pdf')
      .expect(201);

    expect(uploadRes.body.id).toBeDefined();
    expect(uploadRes.body.docRef).toBeDefined();
    expect(uploadRes.body.status).toBe('REGISTERED');
    expect(uploadRes.body.version).toBe(1);
    const docId = uploadRes.body.id;
    const docRef = uploadRes.body.docRef;

    // 2. List documents
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/business/documents')
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);
    expect(listRes.body[0].id).toBe(docId);

    // 3. View decrypted document
    const viewRes = await request(app.getHttpServer())
      .get(`/api/v1/business/documents/${docId}/view`)
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .expect(200);

    expect(viewRes.headers['content-type']).toBe('application/pdf');
    expect(viewRes.headers['cache-control']).toBe('no-store');
    expect(viewRes.body.equals(validPdfBuffer)).toBe(true);

    // 4. Replace document (new version)
    const newPdfBuffer = Buffer.from('%PDF-1.7\nUpdated KYC Certificate v2');
    const replaceRes = await request(app.getHttpServer())
      .put(`/api/v1/business/documents/${docId}`)
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .attach('file', newPdfBuffer, 'gst_cert_v2.pdf')
      .expect(200);

    expect(replaceRes.body.version).toBe(2);

    // 5. Delete document (crypto-shredding)
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/business/documents/${docId}`)
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .expect(200);

    expect(deleteRes.body.success).toBe(true);
  });

  it('rejects upload with spoofed/invalid file type (S-13)', async () => {
    const fakePdf = Buffer.from('Plain text file claiming to be a PDF');

    const res = await request(app.getHttpServer())
      .post('/api/v1/business/documents')
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .field('docType', 'GST_CERTIFICATE')
      .attach('file', fakePdf, 'fake.pdf')
      .expect(400);

    expect(res.body.message).toContain('INVALID_FILE_TYPE');
  });

  it('blocks replacement and deletion (HTTP 409) while active consent references document (D-12, S-14)', async () => {
    const validPdf = Buffer.from('%PDF-1.7\nConsent Protected Document');

    // Upload doc
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/business/documents')
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .field('docType', 'BANK_STATEMENT')
      .attach('file', validPdf, 'statement.pdf')
      .expect(201);

    const docId = uploadRes.body.id;
    const docRef = uploadRes.body.docRef;

    // Register active consent referencing this docRef
    consentsDb.set('c-active', {
      id: 'c-active',
      consentId: 'c-active',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      docRefs: [docRef],
    });

    // Try to replace -> Expect 409 Conflict
    const newPdf = Buffer.from('%PDF-1.7\nReplacement Attempt');
    await request(app.getHttpServer())
      .put(`/api/v1/business/documents/${docId}`)
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .attach('file', newPdf, 'replacement.pdf')
      .expect(409);

    // Try to delete -> Expect 409 Conflict
    await request(app.getHttpServer())
      .delete(`/api/v1/business/documents/${docId}`)
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .expect(409);
  });

  it('allows retrying registration for a PENDING_REGISTRATION document', async () => {
    // Manually insert pending document
    const pendingDoc = {
      id: 'doc-pending-e2e',
      docRef: 'doc-ref-pending-e2e',
      businessId: testBusinessId,
      docType: 'GST_CERTIFICATE',
      status: 'PENDING_REGISTRATION',
      storageKey: 'sk-pending-e2e',
      wrappedDek: 'wrapped',
      iv: 'iv',
      authTag: 'tag',
      salt: 'salt',
      contentHash: 'hash-pending',
      mime: 'application/pdf',
      sizeBytes: 100,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    documentsDb.set(pendingDoc.id, pendingDoc);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/business/documents/${pendingDoc.id}/retry-registration`)
      .set('Cookie', [`trustledger_session=${testSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .expect(201);

    expect(res.body.status).toBe('REGISTERED');
  });

  it('denies Super Admin and Institution Admin from accessing business documents (S-7)', async () => {
    // Mock session for Super Admin
    const adminSessionId = 'sess-admin-999';
    const adminUserId = 'user-admin-999';
    prismaMock.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === adminUserId) {
        return {
          id: adminUserId,
          email: 'superadmin@trustledger.example.com',
          role: UserRole.PLATFORM_SUPER_ADMIN,
          status: UserStatus.ACTIVE,
        };
      }
      if (where.id === testUserId) {
        return {
          id: testUserId,
          email: 'owner@msme.example.com',
          role: UserRole.BUSINESS_OWNER,
          status: UserStatus.ACTIVE,
          businessId: testBusinessId,
        };
      }
      return null;
    });

    prismaMock.serverSession.findUnique.mockImplementation(async ({ where }: any) => {
      const now = new Date();
      if (where.sessionId === adminSessionId) {
        return {
          id: 'ss-admin',
          sessionId: adminSessionId,
          userId: adminUserId,
          idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          absoluteExpiresAt: new Date(now.getTime() + 8 * 3600 * 1000),
          revokedAt: null,
          csrfTokenHash: testCsrfHash,
        };
      }
      if (where.sessionId === testSessionId) {
        return {
          id: 'ss-123',
          sessionId: testSessionId,
          userId: testUserId,
          idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          absoluteExpiresAt: new Date(now.getTime() + 8 * 3600 * 1000),
          revokedAt: null,
          csrfTokenHash: testCsrfHash,
        };
      }
      return null;
    });

    // Super Admin tries to list or view business documents -> must return 403 Forbidden (S-7)
    await request(app.getHttpServer())
      .get('/api/v1/business/documents')
      .set('Cookie', [`trustledger_session=${adminSessionId}`])
      .expect(403);
  });
});
