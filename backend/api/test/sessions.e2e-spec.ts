import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { UserRole, UserStatus, InstitutionStatus } from '@prisma/client';
import { createCanvas } from '@napi-rs/canvas';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { LEDGER_SERVICE, LedgerService } from '../src/ledger/ledger.interface';
import { OTP_DELIVERY_PROVIDER, OtpDeliveryProvider, OtpDeliveryPayload } from '../src/otp/otp.interface';
import { STORAGE_PROVIDER, StorageProvider } from '../src/storage/storage.interface';

describe('Workflow 3 (W3) Sessions and Secure Document Viewing E2E (Stage 6)', () => {
  let app: INestApplication;
  let capturedOtps: OtpDeliveryPayload[] = [];
  let submittedLedgerEvents: any[] = [];

  const testOfficerUserId = 'user-officer-w3';
  const testOfficerEmail = 'officer@banka.com';
  const testInstitutionId = 'inst-bank-w3';
  const testMspId = 'BankAOrgMSP';

  const testOtherOfficerUserId = 'user-officer-w3-bankb';
  const testOtherInstitutionId = 'inst-bank-b';

  const testOwnerUserId = 'user-owner-w3';
  const testBusinessId = 'biz-w3-123';
  const testBusinessRef = 'biz-ref-w3-123';

  const officerSessionId = 'sess-officer-w3';
  const otherOfficerSessionId = 'sess-other-officer-w3';
  const ownerSessionId = 'sess-owner-w3';

  const testCsrfToken = 'valid-test-csrf-token-stage6';
  const testCsrfHash = crypto.createHash('sha256').update(testCsrfToken).digest('hex');

  const testUserAgent = 'TrustLedger-E2E-Agent/1.0';

  const testConsentId = 'consent-w3-100';
  const testDocRef = 'doc-pan-w3-001';

  // In-memory DB state
  const sessionsDb = new Map<string, any>();
  const documentsDb = new Map<string, any>();
  const consentGrantsDb = new Map<string, any>();
  const accessRequestsDb = new Map<string, any>();
  const otpChallengesDb = new Map<string, any>();
  const auditRecords: any[] = [];
  const storageMap = new Map<string, Buffer>();

  beforeAll(async () => {
    capturedOtps = [];
    submittedLedgerEvents = [];
    sessionsDb.clear();
    documentsDb.clear();
    consentGrantsDb.clear();
    accessRequestsDb.clear();
    otpChallengesDb.clear();
    auditRecords.length = 0;
    storageMap.clear();

    // Prepare encrypted sample document
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, 100, 100);
    const samplePngBytes = canvas.toBuffer('image/png');

    // Deterministic mock encryption
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(samplePngBytes), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const storageKey = `w3/docs/${testDocRef}`;
    storageMap.set(storageKey, Buffer.concat([iv, authTag, ciphertext]));

    // Master key wrap mock
    const masterKey = crypto.createHash('sha256').update('test-master-key-stage6').digest();
    const wrapCipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const encryptedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
    const dekAuthTag = wrapCipher.getAuthTag();

    documentsDb.set(testDocRef, {
      id: 'doc-db-1',
      docRef: testDocRef,
      businessRef: testBusinessRef,
      documentType: 'PAN',
      fileName: 'pan.png',
      mimeType: 'image/png',
      fileSizeBytes: samplePngBytes.length,
      ciphertextHash: crypto.createHash('sha256').update(samplePngBytes).digest('hex'),
      saltedDocumentHash: crypto.createHash('sha256').update(samplePngBytes).digest('hex'),
      storagePath: storageKey,
      encryptedDek: encryptedDek.toString('base64'),
      dekAuthTag: dekAuthTag.toString('base64'),
      status: 'AVAILABLE',
      ledgerTxId: 'tx-doc-123',
    });

    accessRequestsDb.set('req-w3-1', {
      id: 'req-w3-1',
      businessRef: testBusinessRef,
      institutionId: testInstitutionId,
      allowDownload: false,
    });

    consentGrantsDb.set(testConsentId, {
      id: 'consent-db-w3',
      consentId: testConsentId,
      requestId: 'req-w3-1',
      businessRef: testBusinessRef,
      institutionId: testInstitutionId,
      scopeType: 'DOCUMENTS',
      docRefs: [testDocRef],
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      status: 'ACTIVE',
    });

    const mockDeliveryProvider: OtpDeliveryProvider = {
      deliver: jest.fn().mockImplementation(async (payload: OtpDeliveryPayload) => {
        capturedOtps.push(payload);
      }),
    };

    const mockStorage: StorageProvider = {
      store: jest.fn().mockImplementation(async (key: string, data: Buffer) => {
        storageMap.set(key, data);
      }),
      retrieve: jest.fn().mockImplementation(async (key: string) => {
        const data = storageMap.get(key);
        if (!data) throw new Error(`Not found in mock storage: ${key}`);
        return data;
      }),
      delete: jest.fn().mockImplementation(async (key: string) => {
        storageMap.delete(key);
      }),
      exists: jest.fn().mockImplementation(async (key: string) => storageMap.has(key)),
    };

    const mockLedger: LedgerService = {
      checkAccess: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ACCESS_GRANTED' }),
      submitTransaction: jest.fn().mockImplementation(async (mspId, func, ...args) => {
        submittedLedgerEvents.push({ mspId, func, args });
        return 'tx-ledger-hash-' + crypto.randomUUID();
      }),
      evaluateTransaction: jest.fn().mockResolvedValue(JSON.stringify({ allowed: true })),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    const prismaMock: any = {
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testOfficerUserId) {
            return {
              id: testOfficerUserId,
              email: testOfficerEmail,
              phone: '+919876543210',
              role: UserRole.KYC_OFFICER,
              status: UserStatus.ACTIVE,
              institutionId: testInstitutionId,
            };
          }
          if (where.id === testOtherOfficerUserId) {
            return {
              id: testOtherOfficerUserId,
              email: 'other@bankb.com',
              phone: '+919876543211',
              role: UserRole.KYC_OFFICER,
              status: UserStatus.ACTIVE,
              institutionId: testOtherInstitutionId,
            };
          }
          if (where.id === testOwnerUserId) {
            return {
              id: testOwnerUserId,
              email: 'owner@w3.com',
              phone: '+919876543212',
              role: UserRole.BUSINESS_OWNER,
              status: UserStatus.ACTIVE,
              businessId: testBusinessId,
            };
          }
          return null;
        }),
      },
      institution: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testInstitutionId) {
            return {
              id: testInstitutionId,
              name: 'State Bank A',
              status: InstitutionStatus.ACTIVE,
              mspId: testMspId,
            };
          }
          if (where.id === testOtherInstitutionId) {
            return {
              id: testOtherInstitutionId,
              name: 'Bank B',
              status: InstitutionStatus.ACTIVE,
              mspId: 'BankBOrgMSP',
            };
          }
          return null;
        }),
      },
      business: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.businessRef === testBusinessRef || where.id === testBusinessId) {
            return {
              id: testBusinessId,
              businessRef: testBusinessRef,
              legalName: 'W3 Global MSME Ltd',
              ownerUserId: testOwnerUserId,
            };
          }
          return null;
        }),
      },
      serverSession: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          const now = new Date();
          if (where.sessionId === officerSessionId) {
            return {
              sessionId: officerSessionId,
              userId: testOfficerUserId,
              idleExpiresAt: new Date(now.getTime() + 3600000),
              absoluteExpiresAt: new Date(now.getTime() + 86400000),
              csrfTokenHash: testCsrfHash,
            };
          }
          if (where.sessionId === otherOfficerSessionId) {
            return {
              sessionId: otherOfficerSessionId,
              userId: testOtherOfficerUserId,
              idleExpiresAt: new Date(now.getTime() + 3600000),
              absoluteExpiresAt: new Date(now.getTime() + 86400000),
              csrfTokenHash: testCsrfHash,
            };
          }
          if (where.sessionId === ownerSessionId) {
            return {
              sessionId: ownerSessionId,
              userId: testOwnerUserId,
              idleExpiresAt: new Date(now.getTime() + 3600000),
              absoluteExpiresAt: new Date(now.getTime() + 86400000),
              csrfTokenHash: testCsrfHash,
            };
          }
          return null;
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      consentGrant: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return consentGrantsDb.get(where.consentId || where.id) || null;
        }),
      },
      accessRequest: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return accessRequestsDb.get(where.id) || null;
        }),
      },
      document: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          const doc = documentsDb.get(testDocRef);
          return doc ? [doc] : [];
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return documentsDb.get(where.docRef) || null;
        }),
      },
      accessSession: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const s of sessionsDb.values()) {
            if (s.consentId === where.consentId && s.status === 'ACTIVE') {
              return s;
            }
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return sessionsDb.get(where.id) || null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const session = {
            id: 'session-' + crypto.randomUUID(),
            ...data,
            viewedDocRefs: [],
            denialCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sessionsDb.set(session.id, session);
          return session;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const session = sessionsDb.get(where.id);
          if (!session) return null;
          if (data.viewedDocRefs?.push) {
            session.viewedDocRefs = [...(session.viewedDocRefs || []), data.viewedDocRefs.push];
          }
          if (data.denialCount?.increment) {
            session.denialCount = (session.denialCount || 0) + data.denialCount.increment;
          }
          Object.assign(session, data);
          return session;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const s of sessionsDb.values()) {
            if (where.id?.in && where.id.in.includes(s.id)) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        }),
        findMany: jest.fn().mockImplementation(async () => Array.from(sessionsDb.values())),
      },
      otpChallenge: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const challenge = {
            id: 'challenge-' + crypto.randomUUID(),
            ...data,
            attempts: 0,
            consumedAt: null,
            createdAt: new Date(),
          };
          otpChallengesDb.set(challenge.id, challenge);
          return challenge;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const c of otpChallengesDb.values()) {
            if (
              c.boundEntityId === where.boundEntityId &&
              c.purpose === where.purpose &&
              !c.consumedAt
            ) {
              return c;
            }
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return otpChallengesDb.get(where.id) || null;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          return Array.from(otpChallengesDb.values());
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const c = otpChallengesDb.get(where.id);
          if (c) Object.assign(c, data);
          return c;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          return { count: 0 };
        }),
      },
      auditEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          auditRecords.push(data);
          return { id: 'audit-' + crypto.randomUUID(), ...data };
        }),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(OTP_DELIVERY_PROVIDER)
      .useValue(mockDeliveryProvider)
      .overrideProvider(LEDGER_SERVICE)
      .useValue(mockLedger)
      .overrideProvider(STORAGE_PROVIDER)
      .useValue(mockStorage)
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
  });

  afterAll(async () => {
    await app.close();
  });

  let createdSessionId: string;
  let issuedOtpCode: string;

  it('1. KYC Officer creates an AccessSession in PENDING_OTP status (POST /institution/sessions)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/institution/sessions')
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .send({
        consentId: testConsentId,
        requestedDurationMinutes: 45,
      })
      .expect(201);

    expect(res.body.sessionId).toBeDefined();
    expect(res.body.status).toBe('PENDING_OTP');
    expect(res.body.challengeId).toBeDefined();

    createdSessionId = res.body.sessionId;

    // Verify OTP delivery was dispatched
    expect(capturedOtps.length).toBeGreaterThan(0);
    issuedOtpCode = capturedOtps[capturedOtps.length - 1].code;
    expect(issuedOtpCode).toMatch(/^\d{6}$/);
  });

  it('2. S-7: Non-KYC_OFFICER (e.g. MSME Owner) cannot create an AccessSession (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/institution/sessions')
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .send({
        consentId: testConsentId,
      })
      .expect(403);
  });

  it('3. Activates AccessSession with valid OTP (POST /institution/sessions/:id/activate)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/institution/sessions/${createdSessionId}/activate`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .send({
        otpCode: issuedOtpCode,
      })
      .expect(200);

    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.expiresAt).toBeDefined();

    // Verify on-chain SESSION_OPENED was submitted
    const sessionOpenedTx = submittedLedgerEvents.find((e) => e.args.includes('SESSION_OPENED'));
    expect(sessionOpenedTx).toBeDefined();
  });

  it('4. S-5: Forwarded URL / Mismatched User-Agent is denied with 403 FINGERPRINT_MISMATCH', async () => {
    const hijackedAgent = 'AttackerBrowser/2.0';

    const res = await request(app.getHttpServer())
      .get(`/api/v1/institution/sessions/${createdSessionId}/documents`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', hijackedAgent)
      .expect(403);

    expect(res.body.code).toBe('FINGERPRINT_MISMATCH');
  });

  it('5. Lists approved documents in active session (GET /institution/sessions/:id/documents)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/institution/sessions/${createdSessionId}/documents`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].docRef).toBe(testDocRef);
  });

  it('6. S-18: Out of scope document is denied with 403 DOC_NOT_IN_SCOPE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/institution/sessions/${createdSessionId}/documents/doc-not-approved/pages/1`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .expect(403);

    expect(res.body.code).toBe('DOC_NOT_IN_SCOPE');
  });

  it('7. S-15: Download without explicit allowDownload is denied with 403 DOWNLOAD_NOT_PERMITTED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/institution/sessions/${createdSessionId}/documents/${testDocRef}/download`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .expect(403);

    expect(res.body.code).toBe('DOWNLOAD_NOT_PERMITTED');
  });

  it('8. Explicitly closes session (POST /institution/sessions/:id/close)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/institution/sessions/${createdSessionId}/close`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .expect(200);

    expect(res.body.status).toBe('CLOSED');

    // Verify on-chain SESSION_CLOSED was recorded
    const sessionClosedTx = submittedLedgerEvents.find((e) => e.args.includes('SESSION_CLOSED'));
    expect(sessionClosedTx).toBeDefined();
  });

  it('9. Accessing documents on CLOSED session is denied with 403', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/institution/sessions/${createdSessionId}/documents`)
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .set('User-Agent', testUserAgent)
      .expect(403);
  });
});
