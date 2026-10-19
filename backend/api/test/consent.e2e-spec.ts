import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { UserRole, UserStatus, RequestScopeType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { LEDGER_SERVICE, LedgerService } from '../src/ledger/ledger.interface';
import { OTP_DELIVERY_PROVIDER, OtpDeliveryProvider, OtpDeliveryPayload } from '../src/otp/otp.interface';

describe('Workflow 2 (W2) Consent & Requests E2E (Stage 5)', () => {
  let app: INestApplication;
  let ledger: LedgerService;
  let capturedOtps: OtpDeliveryPayload[] = [];

  const testBusinessId = 'biz-w2-123';
  const testBusinessRef = 'biz-ref-w2-123';
  const testOwnerUserId = 'user-owner-w2';
  const testOfficerUserId = 'user-kyc-w2';
  const testInstitutionId = 'inst-bank-w2';
  const testMspId = 'BankAOrgMSP';

  const ownerSessionId = 'sess-owner-w2';
  const officerSessionId = 'sess-officer-w2';

  const testCsrfToken = 'valid-test-csrf-token-12345';
  const testCsrfHash = crypto.createHash('sha256').update(testCsrfToken).digest('hex');

  // In-memory data collections for E2E verification
  const shareCodesDb = new Map<string, any>();
  const accessRequestsDb = new Map<string, any>();
  const consentGrantsDb = new Map<string, any>();
  const notificationsDb = new Map<string, any>();
  const otpChallengesDb = new Map<string, any>();

  beforeAll(async () => {
    capturedOtps = [];
    shareCodesDb.clear();
    accessRequestsDb.clear();
    consentGrantsDb.clear();
    notificationsDb.clear();
    otpChallengesDb.clear();

    const mockDeliveryProvider: OtpDeliveryProvider = {
      deliver: jest.fn().mockImplementation(async (payload: OtpDeliveryPayload) => {
        capturedOtps.push(payload);
      }),
    };

    const prismaMock: any = {
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testOwnerUserId) {
            return {
              id: testOwnerUserId,
              email: 'owner@w2logistics.com',
              phone: '+919876543210',
              role: UserRole.BUSINESS_OWNER,
              status: UserStatus.ACTIVE,
              businessId: testBusinessId,
            };
          }
          if (where.id === testOfficerUserId) {
            return {
              id: testOfficerUserId,
              email: 'officer@banka.com',
              role: UserRole.KYC_OFFICER,
              status: UserStatus.ACTIVE,
              institutionId: testInstitutionId,
            };
          }
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      business: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testBusinessId || where.businessRef === testBusinessRef) {
            return {
              id: testBusinessId,
              businessRef: testBusinessRef,
              legalName: 'W2 Logistics Private Limited',
              ownerUserId: testOwnerUserId,
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
              name: 'Bank A National',
              mspId: testMspId,
              status: 'ACTIVE',
            };
          }
          return null;
        }),
      },
      serverSession: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          const now = new Date();
          if (where.sessionId === ownerSessionId) {
            return {
              id: 'ss-owner-1',
              sessionId: ownerSessionId,
              userId: testOwnerUserId,
              idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
              absoluteExpiresAt: new Date(now.getTime() + 8 * 3600 * 1000),
              revokedAt: null,
              csrfTokenHash: testCsrfHash,
            };
          }
          if (where.sessionId === officerSessionId) {
            return {
              id: 'ss-officer-1',
              sessionId: officerSessionId,
              userId: testOfficerUserId,
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
      otpChallenge: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return otpChallengesDb.get(where.id) || null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          otpChallengesDb.set(data.id, { ...data });
          return { ...data };
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = otpChallengesDb.get(where.id);
          if (existing) {
            Object.assign(existing, data);
          }
          return existing;
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      profileShareCode: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const id = `code-${Date.now()}`;
          const record = { id, usedAt: null, ...data, createdAt: new Date() };
          shareCodesDb.set(id, record);
          return record;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const item of shareCodesDb.values()) {
            if (where.id && item.id !== where.id) continue;
            if (where.businessId && item.businessId !== where.businessId) continue;
            if (where.codeHash && item.codeHash !== where.codeHash) continue;
            if (where.usedAt === null && item.usedAt) continue;
            return item;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async () => Array.from(shareCodesDb.values())),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = shareCodesDb.get(where.id);
          if (existing) Object.assign(existing, data);
          return existing;
        }),
      },
      accessRequest: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const id = `req-${Date.now()}`;
          const record = { id, ...data, createdAt: new Date() };
          accessRequestsDb.set(id, record);
          return record;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const req of accessRequestsDb.values()) {
            if (where.id && req.id !== where.id) continue;
            if (where.businessId && req.businessId !== where.businessId) continue;
            if (where.institutionId && req.institutionId !== where.institutionId) continue;
            return req;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async () => Array.from(accessRequestsDb.values())),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = accessRequestsDb.get(where.id);
          if (existing) Object.assign(existing, data);
          return existing;
        }),
      },
      consentGrant: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const id = `grant-${Date.now()}`;
          const record = { id, ...data, createdAt: new Date() };
          consentGrantsDb.set(data.consentId, record);
          consentGrantsDb.set(id, record);
          return record;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const c of consentGrantsDb.values()) {
            if (where.businessRef && c.businessRef !== where.businessRef) continue;
            if (where.institutionId && c.institutionId !== where.institutionId) continue;
            if (where.scopeType && c.scopeType !== where.scopeType) continue;
            if (where.status && c.status !== where.status) continue;
            return c;
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return consentGrantsDb.get(where.consentId) || null;
        }),
        findMany: jest.fn().mockImplementation(async () => Array.from(consentGrantsDb.values())),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = consentGrantsDb.get(where.id) || consentGrantsDb.get(where.consentId);
          if (existing) Object.assign(existing, data);
          return existing;
        }),
      },
      accessSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      notification: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const id = `notif-${Date.now()}`;
          const record = { id, ...data, isRead: false, createdAt: new Date() };
          notificationsDb.set(id, record);
          return record;
        }),
        findMany: jest.fn().mockImplementation(async () => Array.from(notificationsDb.values())),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'aud-w2-1' }),
      },
      ledgerTx: {
        create: jest.fn().mockResolvedValue({ id: 'tx-w2-1' }),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(OTP_DELIVERY_PROVIDER)
      .useValue(mockDeliveryProvider)
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

    // Register institution & business on ledger
    ledger = app.get<LedgerService>(LEDGER_SERVICE);
    await ledger.submitTransaction(
      'PlatformOrgMSP',
      'RegisterInstitution',
      testInstitutionId,
      testMspId,
      'BANK',
    );
    await ledger.submitTransaction(
      'PlatformOrgMSP',
      'RegisterBusiness',
      testBusinessRef,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs complete Workflow 2 (W2): Share Code -> OTP Confirm -> Brute-Force Rate Limit -> Redeem -> Request -> Partial Approval with OTP -> Revocation', async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Owner initiates share code challenge (W2 step 1)
    // -------------------------------------------------------------------------
    const challengeRes = await request(app.getHttpServer())
      .post('/api/v1/business/share-codes')
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .send({ durationMinutes: 10080 })
      .expect(201);

    expect(challengeRes.body).toHaveProperty('shareCodeId');
    expect(challengeRes.body).toHaveProperty('challengeId');
    const { shareCodeId, challengeId } = challengeRes.body;

    // Check OTP delivered to owner
    const initialOtp = capturedOtps.find((o) => o.challengeId === challengeId);
    expect(initialOtp).toBeDefined();
    expect(initialOtp!.code).toMatch(/^\d{6}$/);

    // -------------------------------------------------------------------------
    // STEP 2: Owner confirms share code with OTP (W2 step 1)
    // -------------------------------------------------------------------------
    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/business/share-codes/${shareCodeId}/confirm`)
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .send({
        otpCode: initialOtp!.code,
      })
      .expect(201);

    expect(confirmRes.body).toHaveProperty('code');
    const shareCode = confirmRes.body.code;
    expect(shareCode).toHaveLength(8);
    // Unambiguous 32-character alphabet (Crockford Base32)
    expect(shareCode).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);

    // -------------------------------------------------------------------------
    // STEP 3: S-10 Brute force rate limit protection
    // -------------------------------------------------------------------------
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/institution/profile-lookup')
        .set('Cookie', [`trustledger_session=${officerSessionId}`])
        .set('x-csrf-token', testCsrfToken)
        .send({ code: '99999999' })
        .expect(404);
    }

    // 6th attempt by the same officer user must be locked out with 429 (S-10)
    await request(app.getHttpServer())
      .post('/api/v1/institution/profile-lookup')
      .set('Cookie', [`trustledger_session=${officerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .send({ code: '99999999' })
      .expect(429);

    // -------------------------------------------------------------------------
    // STEP 4: Officer redeems valid share code with Idempotency-Key (W2 step 2)
    // -------------------------------------------------------------------------
    // We clear attempts or use fresh officer ID to avoid lockout on valid redemption
    const freshOfficerSession = 'sess-officer-fresh';
    const freshOfficerId = 'user-officer-fresh-1';

    // Mock session for fresh officer
    (app.get(PrismaService).serverSession.findUnique as jest.Mock).mockImplementation(
      async ({ where }: any) => {
        const now = new Date();
        if (where.sessionId === freshOfficerSession) {
          return {
            id: 'ss-officer-fresh',
            sessionId: freshOfficerSession,
            userId: freshOfficerId,
            idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
            absoluteExpiresAt: new Date(now.getTime() + 8 * 3600 * 1000),
            revokedAt: null,
            csrfTokenHash: testCsrfHash,
          };
        }
        if (where.sessionId === ownerSessionId) {
          return {
            id: 'ss-owner-1',
            sessionId: ownerSessionId,
            userId: testOwnerUserId,
            idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
            absoluteExpiresAt: new Date(now.getTime() + 8 * 3600 * 1000),
            revokedAt: null,
            csrfTokenHash: testCsrfHash,
          };
        }
        return null;
      },
    );

    (app.get(PrismaService).user.findUnique as jest.Mock).mockImplementation(
      async ({ where }: any) => {
        if (where.id === freshOfficerId) {
          return {
            id: freshOfficerId,
            email: 'fresh.officer@banka.com',
            role: UserRole.KYC_OFFICER,
            status: UserStatus.ACTIVE,
            institutionId: testInstitutionId,
          };
        }
        if (where.id === testOwnerUserId) {
          return {
            id: testOwnerUserId,
            email: 'owner@w2logistics.com',
            phone: '+919876543210',
            role: UserRole.BUSINESS_OWNER,
            status: UserStatus.ACTIVE,
            businessId: testBusinessId,
          };
        }
        return null;
      },
    );

    const idempotencyKey = `idem-redeem-${Date.now()}`;
    const redeemRes = await request(app.getHttpServer())
      .post('/api/v1/institution/profile-lookup')
      .set('Cookie', [`trustledger_session=${freshOfficerSession}`])
      .set('x-csrf-token', testCsrfToken)
      .set('idempotency-key', idempotencyKey)
      .send({ code: shareCode })
      .expect(201);

    expect(redeemRes.body).toHaveProperty('consentId');
    // W2 step 2: Officer sees ONLY the legal name
    expect(redeemRes.body.business).toEqual({ legalName: 'W2 Logistics Private Limited' });
    const profileConsentId = redeemRes.body.consentId;

    // Verify Idempotent retry returns identical response
    const retryRes = await request(app.getHttpServer())
      .post('/api/v1/institution/profile-lookup')
      .set('Cookie', [`trustledger_session=${freshOfficerSession}`])
      .set('x-csrf-token', testCsrfToken)
      .set('idempotency-key', idempotencyKey)
      .send({ code: shareCode })
      .expect(201);

    expect(retryRes.body.consentId).toBe(profileConsentId);

    // Verify ledger has the active PROFILE consent (I-1, D-11)
    const ledgerCheck = await ledger.checkAccess(profileConsentId, testInstitutionId, 'PROFILE');
    expect(ledgerCheck.allowed).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 5: KYC Officer requests documents (W2 step 3)
    // -------------------------------------------------------------------------
    const requestRes = await request(app.getHttpServer())
      .post('/api/v1/institution/requests')
      .set('Cookie', [`trustledger_session=${freshOfficerSession}`])
      .set('x-csrf-token', testCsrfToken)
      .send({
        businessId: testBusinessId,
        scopeType: RequestScopeType.DOCUMENTS,
        requestedDocTypes: ['PAN_CARD', 'GST_CERTIFICATE'],
        purposeCode: 'KYC_VERIFICATION',
        requestedDurationMinutes: 1440,
        allowDownload: false,
        message: 'Please provide PAN and GST for KYC',
      })
      .expect(201);

    expect(requestRes.body).toHaveProperty('id');
    expect(requestRes.body.status).toBe('PENDING');
    const requestId = requestRes.body.id;

    // -------------------------------------------------------------------------
    // STEP 6: Owner requests approval OTP for this request (W2 step 4)
    // -------------------------------------------------------------------------
    const reqOtpRes = await request(app.getHttpServer())
      .post(`/api/v1/business/requests/${requestId}/otp`)
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .expect(201);

    expect(reqOtpRes.body).toHaveProperty('challengeId');
    const reqChallengeId = reqOtpRes.body.challengeId;

    const approvalOtp = capturedOtps.find((o) => o.challengeId === reqChallengeId);
    expect(approvalOtp).toBeDefined();

    // -------------------------------------------------------------------------
    // STEP 7: Owner partially approves request (W2 step 5)
    // Approves only PAN_CARD, leaving GST_CERTIFICATE unapproved
    // -------------------------------------------------------------------------
    const approvedDocRef = 'doc-ref-pan-uuid-123';
    const decideRes = await request(app.getHttpServer())
      .post(`/api/v1/business/requests/${requestId}/decision`)
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .send({
        decision: 'APPROVE',
        otpCode: approvalOtp!.code,
        approvedDocRefs: [approvedDocRef],
      })
      .expect(201);

    expect(decideRes.body.request.status).toBe('PARTIALLY_APPROVED');
    expect(decideRes.body.consentGrant).toBeDefined();
    expect(decideRes.body.consentGrant.docRefs).toEqual([approvedDocRef]);
    const documentConsentId = decideRes.body.consentGrant.consentId;

    // Verify ledger has the document consent with exact docRef (I-1, I-2)
    const docCheck = await ledger.checkAccess(
      documentConsentId,
      testInstitutionId,
      'DOCUMENTS',
      approvedDocRef,
    );
    expect(docCheck.allowed).toBe(true);

    // Unapproved docRef must be denied by ledger
    const unapprovedCheck = await ledger.checkAccess(
      documentConsentId,
      testInstitutionId,
      'DOCUMENTS',
      'doc-ref-unapproved-gst',
    );
    expect(unapprovedCheck.allowed).toBe(false);

    // -------------------------------------------------------------------------
    // STEP 8: Owner revokes consent (W2 step 6)
    // -------------------------------------------------------------------------
    const revokeRes = await request(app.getHttpServer())
      .post(`/api/v1/business/consents/${documentConsentId}/revoke`)
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .set('x-csrf-token', testCsrfToken)
      .expect(200);

    expect(revokeRes.body.status).toBe('REVOKED');

    // Verify ledger immediately denies access after revocation (I-1 fail-closed)
    const afterRevokeCheck = await ledger.checkAccess(
      documentConsentId,
      testInstitutionId,
      'DOCUMENTS',
      approvedDocRef,
    );
    expect(afterRevokeCheck.allowed).toBe(false);
    expect(afterRevokeCheck.reasonCode).toBe('CONSENT_REVOKED');

    // -------------------------------------------------------------------------
    // STEP 9: Verify Notifications & Audit
    // -------------------------------------------------------------------------
    const notifsRes = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Cookie', [`trustledger_session=${ownerSessionId}`])
      .expect(200);

    expect(Array.isArray(notifsRes.body)).toBe(true);
    expect(notifsRes.body.length).toBeGreaterThan(0);
  });
});
