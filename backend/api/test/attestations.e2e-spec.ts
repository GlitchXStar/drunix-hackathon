import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { UserRole, UserStatus, InstitutionStatus, KycOutcome, AttestationStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { LEDGER_SERVICE, LedgerService } from '../src/ledger/ledger.interface';
import { OTP_DELIVERY_PROVIDER, OtpDeliveryProvider } from '../src/otp/otp.interface';
import { STORAGE_PROVIDER, StorageProvider } from '../src/storage/storage.interface';

describe('Stage 7 Integration Suite: KYC Reviews, Attestations & Cross-Institution Lookup', () => {
  let app: INestApplication;

  const testCsrfToken = 'valid-test-csrf-token-stage7';
  const testCsrfHash = crypto.createHash('sha256').update(testCsrfToken).digest('hex');

  // Bank A
  const testBankOfficerId = 'user-officer-bank-a';
  const testBankInstId = 'inst-bank-a';
  const bankMspId = 'BankAOrgMSP';
  const bankSessionCookie = 'sess-bank-officer';

  // NBFC
  const testNbfcOfficerId = 'user-officer-nbfc';
  const testNbfcInstId = 'inst-nbfc';
  const nbfcMspId = 'NbfcOrgMSP';
  const nbfcSessionCookie = 'sess-nbfc-officer';

  // MSME Owner
  const testOwnerId = 'user-owner-msme';
  const testBusinessId = 'biz-stage7-101';
  const testBusinessRef = 'biz-ref-stage7-101';
  const ownerSessionCookie = 'sess-owner-msme';

  // Documents & Hashes
  const testDocRefPan = 'doc-pan-stage7';
  const testDocRefGst = 'doc-gst-stage7';
  const testDocRefUnviewed = 'doc-unviewed-stage7';
  const hashPan = crypto.createHash('sha256').update('content-pan-v1').digest('hex');
  const hashGst = crypto.createHash('sha256').update('content-gst-v1').digest('hex');
  const hashUnviewed = crypto.createHash('sha256').update('content-unviewed-v1').digest('hex');

  // Consents & Sessions
  const bankConsentId = 'consent-banka-docs';
  const nbfcProfileConsentId = 'consent-nbfc-profile';
  const activeAccessSessionId = 'session-banka-active';

  // In-memory test projections
  const kycReviewsDb = new Map<string, any>();
  const attestationsDb = new Map<string, any>();
  const documentsDb = new Map<string, any>();
  const accessSessionsDb = new Map<string, any>();
  const consentGrantsDb = new Map<string, any>();
  const institutionsDb = new Map<string, any>();

  // Ledger state mock
  const onChainAttestations = new Map<string, any>();
  let ledgerCheckAccessAllowed = true;
  let ledgerFailClosedError = false;

  beforeAll(async () => {
    kycReviewsDb.clear();
    attestationsDb.clear();
    documentsDb.clear();
    accessSessionsDb.clear();
    consentGrantsDb.clear();
    institutionsDb.clear();
    onChainAttestations.clear();
    ledgerCheckAccessAllowed = true;
    ledgerFailClosedError = false;

    // Seed Institutions
    institutionsDb.set(testBankInstId, {
      id: testBankInstId,
      name: 'Bank A National',
      type: 'BANK',
      mspId: bankMspId,
      status: InstitutionStatus.ACTIVE,
    });
    institutionsDb.set(testNbfcInstId, {
      id: testNbfcInstId,
      name: 'Northern NBFC Credit',
      type: 'NBFC',
      mspId: nbfcMspId,
      status: InstitutionStatus.ACTIVE,
    });

    // Seed Documents for Business
    documentsDb.set(testDocRefPan, {
      id: 'doc-1',
      docRef: testDocRefPan,
      businessId: testBusinessId,
      contentHash: hashPan,
      status: 'AVAILABLE',
    });
    documentsDb.set(testDocRefGst, {
      id: 'doc-2',
      docRef: testDocRefGst,
      businessId: testBusinessId,
      contentHash: hashGst,
      status: 'AVAILABLE',
    });
    documentsDb.set(testDocRefUnviewed, {
      id: 'doc-3',
      docRef: testDocRefUnviewed,
      businessId: testBusinessId,
      contentHash: hashUnviewed,
      status: 'AVAILABLE',
    });

    // Seed Bank A Documents Consent (covers PAN & GST)
    consentGrantsDb.set(bankConsentId, {
      id: 'consent-bank-db',
      consentId: bankConsentId,
      businessRef: testBusinessRef,
      institutionId: testBankInstId,
      scopeType: 'DOCUMENTS',
      docRefs: [testDocRefPan, testDocRefGst],
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });

    // Seed Active AccessSession for Bank A (officer viewed PAN and GST, but NOT testDocRefUnviewed)
    accessSessionsDb.set(activeAccessSessionId, {
      id: activeAccessSessionId,
      officerUserId: testBankOfficerId,
      institutionId: testBankInstId,
      consentId: bankConsentId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      viewedDocRefs: [testDocRefPan, testDocRefGst],
    });

    // Seed NBFC PROFILE Consent
    consentGrantsDb.set(nbfcProfileConsentId, {
      id: 'consent-nbfc-db',
      consentId: nbfcProfileConsentId,
      businessRef: testBusinessRef,
      institutionId: testNbfcInstId,
      scopeType: 'PROFILE',
      docRefs: [],
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });

    const mockLedger: LedgerService = {
      checkAccess: jest.fn().mockImplementation(async (consentId, instId, scope) => {
        if (ledgerFailClosedError) {
          throw new Error('Drunix ledger gateway connection timed out');
        }
        if (!ledgerCheckAccessAllowed) {
          return { allowed: false, reasonCode: 'ACCESS_DENIED' };
        }
        return { allowed: true, reasonCode: 'ACCESS_GRANTED' };
      }),
      submitTransaction: jest.fn().mockImplementation(async (actingMsp, func, ...args) => {
        if (ledgerFailClosedError) {
          throw new Error('Drunix endorsement failure');
        }
        if (func === 'IssueAttestation') {
          const [attId, bizRef, type, snapshotsJson, validUntil] = args;
          const att = {
            attId,
            businessRef: bizRef,
            issuerInstId: actingMsp,
            type,
            status: 'VALID',
            docHashSnapshot: JSON.parse(snapshotsJson),
            issuedAt: new Date().toISOString(),
            validUntil,
          };
          onChainAttestations.set(attId, att);
          return 'tx-ledger-issue-' + attId;
        }
        if (func === 'UpdateAttestationStatus') {
          const [attId, status, reasonCode] = args;
          const att = onChainAttestations.get(attId);
          if (att) {
            att.status = status;
            att.reasonCode = reasonCode;
          }
          return 'tx-ledger-status-' + attId;
        }
        return 'tx-ledger-ok';
      }),
      evaluateTransaction: jest.fn().mockImplementation(async (actingMsp, func, ...args) => {
        if (ledgerFailClosedError) {
          throw new Error('Drunix gateway timeout');
        }
        if (func === 'GetAttestations') {
          const [bizRef] = args;
          const matched = Array.from(onChainAttestations.values()).filter(
            (a) => a.businessRef === bizRef,
          );
          return JSON.stringify(matched);
        }
        return '[]';
      }),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    const mockDeliveryProvider: OtpDeliveryProvider = {
      deliver: jest.fn().mockResolvedValue(undefined),
    };

    const mockStorage: StorageProvider = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(Buffer.from('sample')),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
    };

    const prismaMock: any = {
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === testBankOfficerId) {
            return {
              id: testBankOfficerId,
              email: 'officer@banka.com',
              role: UserRole.KYC_OFFICER,
              status: UserStatus.ACTIVE,
              institutionId: testBankInstId,
            };
          }
          if (where.id === testNbfcOfficerId) {
            return {
              id: testNbfcOfficerId,
              email: 'officer@nbfc.com',
              role: UserRole.KYC_OFFICER,
              status: UserStatus.ACTIVE,
              institutionId: testNbfcInstId,
            };
          }
          if (where.id === testOwnerId) {
            return {
              id: testOwnerId,
              email: 'owner@msme.com',
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
          return institutionsDb.get(where.id) || null;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const inst of institutionsDb.values()) {
            if (
              (where.OR && where.OR.some((o: any) => o.mspId === inst.mspId || o.id === inst.id)) ||
              where.id === inst.id ||
              where.mspId === inst.mspId
            ) {
              return inst;
            }
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
              legalName: 'Apex Precision Tools Pvt Ltd',
              ownerUserId: testOwnerId,
            };
          }
          return null;
        }),
      },
      serverSession: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          const now = new Date();
          let userId: string | null = null;
          if (where.sessionId === bankSessionCookie) userId = testBankOfficerId;
          else if (where.sessionId === nbfcSessionCookie) userId = testNbfcOfficerId;
          else if (where.sessionId === ownerSessionCookie) userId = testOwnerId;

          if (!userId) return null;
          return {
            sessionId: where.sessionId,
            userId,
            idleExpiresAt: new Date(now.getTime() + 3600000),
            absoluteExpiresAt: new Date(now.getTime() + 86400000),
            csrfTokenHash: testCsrfHash,
          };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      accessSession: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return accessSessionsDb.get(where.id) || null;
        }),
      },
      consentGrant: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return consentGrantsDb.get(where.consentId || where.id) || null;
        }),
      },
      document: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.docRef?.in) {
            return where.docRef.in
              .map((ref: string) => documentsDb.get(ref))
              .filter((d: any) => d && d.status !== 'DELETED');
          }
          if (where.businessId === testBusinessId) {
            return Array.from(documentsDb.values()).filter((d: any) => d.status !== 'DELETED');
          }
          return [];
        }),
      },
      kycReview: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const r = {
            id: 'review-' + crypto.randomUUID(),
            ...data,
            createdAt: new Date(),
          };
          kycReviewsDb.set(r.id, r);
          return r;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return kycReviewsDb.get(where.id) || null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const r = kycReviewsDb.get(where.id);
          if (r) Object.assign(r, data);
          return r;
        }),
      },
      attestation: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          attestationsDb.set(data.attId, {
            ...data,
            createdAt: new Date(),
          });
          return attestationsDb.get(data.attId);
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return attestationsDb.get(where.attId) || null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const att = attestationsDb.get(where.attId);
          if (att) Object.assign(att, data);
          return att;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          return Array.from(attestationsDb.values()).filter(
            (a: any) => a.businessRef === where.businessRef,
          );
        }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-event-id' }),
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

  let createdReviewId: string;
  let issuedAttestationId: string;

  it('Step 1: Create a valid review using an authorized active session (W3 step 4)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/institution/kyc-reviews')
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        consentId: bankConsentId,
        accessSessionId: activeAccessSessionId,
        outcome: KycOutcome.VERIFIED,
        checklist: {
          panVerified: true,
          gstVerified: true,
          businessAddressMatch: true,
        },
        notes: 'Confidential officer assessment: PAN and GST verified via government database',
        docRefsReviewed: [testDocRefPan, testDocRefGst],
      });

    expect(res.status).toBe(201);
    expect(res.body.reviewId).toBeDefined();
    expect(res.body.outcome).toBe('VERIFIED');
    expect(res.body.docRefsReviewed).toEqual([testDocRefPan, testDocRefGst]);
    createdReviewId = res.body.reviewId;
  });

  it('Step 1b: Rejects review if referencing unviewed documents in session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/institution/kyc-reviews')
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        consentId: bankConsentId,
        accessSessionId: activeAccessSessionId,
        outcome: KycOutcome.VERIFIED,
        checklist: { allVerified: true },
        notes: 'Attempting to reference unviewed document',
        docRefsReviewed: [testDocRefPan, testDocRefUnviewed], // testDocRefUnviewed was not viewed!
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('was not viewed during AccessSession');
  });

  it('Step 2 & 3: Issue an attestation from VERIFIED review with docHashSnapshot of viewed documents only (W3 step 5)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/institution/attestations')
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        kycReviewId: createdReviewId,
        validityMonths: 12,
        type: 'KYC_BASIC',
      });

    expect(res.status).toBe(201);
    expect(res.body.attId).toBeDefined();
    expect(res.body.status).toBe('VALID');
    expect(res.body.docHashSnapshotCount).toBe(2);
    issuedAttestationId = res.body.attId;

    // Check authoritative on-chain attestation stored
    const onChain = onChainAttestations.get(issuedAttestationId);
    expect(onChain).toBeDefined();
    expect(onChain.docHashSnapshot).toEqual([hashPan, hashGst]);
    expect(onChain.docHashSnapshot).not.toContain(hashUnviewed);
  });

  it('Step 2b: Duplicate issuance is prevented for same review', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/institution/attestations')
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        kycReviewId: createdReviewId,
        validityMonths: 12,
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already been issued');
  });

  it('Step 4 & 5: Look up attestation from NBFC using valid PROFILE consent (W5)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const att = res.body[0];
    expect(att.attId).toBe(issuedAttestationId);
    expect(att.type).toBe('KYC_BASIC');
    expect(att.status).toBe('VALID');
    expect(att.issuerInstitution.name).toBe('Bank A National');
    expect(att.documentsUnchangedSinceAttestation).toBe(true);

    // CRITICAL SECURITY ASSERTION: Internal notes and checklists must NEVER be returned
    expect(att.notes).toBeUndefined();
    expect(att.checklist).toBeUndefined();
    expect(att.officerUserId).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Confidential officer assessment');
  });

  it('Step 6: Suspend an attestation and verify lookup marks it SUSPENDED and documentsUnchangedSinceAttestation=false', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/institution/attestations/${issuedAttestationId}/status`)
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        status: 'SUSPENDED',
        reasonCode: 'COMPLIANCE_INVESTIGATION',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('SUSPENDED');

    // NBFC lookup now reflects SUSPENDED
    const lookupRes = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(lookupRes.status).toBe(200);
    expect(lookupRes.body[0].status).toBe('SUSPENDED');
    expect(lookupRes.body[0].documentsUnchangedSinceAttestation).toBe(false);
  });

  it('Step 7: Revoke an attestation and verify terminal state (D-9)', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/institution/attestations/${issuedAttestationId}/status`)
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        status: 'REVOKED',
        reasonCode: 'FRAUD_CONFIRMED',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('REVOKED');

    // Attempting reinstatement or further transition is rejected
    const invalidReinstatement = await request(app.getHttpServer())
      .patch(`/api/v1/institution/attestations/${issuedAttestationId}/status`)
      .set('Cookie', `trustledger_session=${bankSessionCookie}`)
      .set('x-csrf-token', testCsrfToken)
      .send({
        status: 'SUSPENDED',
        reasonCode: 'TRYING_TO_CHANGE',
      });

    expect(invalidReinstatement.status).toBe(400);
    expect(invalidReinstatement.body.message).toContain('already REVOKED (terminal state');

    // NBFC lookup shows REVOKED
    const lookupRes = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(lookupRes.status).toBe(200);
    expect(lookupRes.body[0].status).toBe('REVOKED');
    expect(lookupRes.body[0].documentsUnchangedSinceAttestation).toBe(false);
  });

  it('Step 8: Attestation dynamic expiry is computed and enforced correctly', async () => {
    // Add an expired attestation to on-chain store
    const expiredAttId = 'att-expired-test-1';
    onChainAttestations.set(expiredAttId, {
      attId: expiredAttId,
      businessRef: testBusinessRef,
      issuerInstId: bankMspId,
      type: 'KYC_BASIC',
      status: 'VALID',
      docHashSnapshot: [hashPan],
      issuedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
      validUntil: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), // Expired 10 days ago
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(200);
    const expItem = res.body.find((a: any) => a.attId === expiredAttId);
    expect(expItem).toBeDefined();
    expect(expItem.status).toBe('EXPIRED');
    expect(expItem.documentsUnchangedSinceAttestation).toBe(false);
  });

  it('Step 9: Document replacement reflects documentsUnchangedSinceAttestation=false for previously valid attestation', async () => {
    // Issue a second fresh VALID attestation
    const validAttId = 'att-active-compare';
    onChainAttestations.set(validAttId, {
      attId: validAttId,
      businessRef: testBusinessRef,
      issuerInstId: bankMspId,
      type: 'KYC_BASIC',
      status: 'VALID',
      docHashSnapshot: [hashPan, hashGst],
      issuedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });

    // Initial check: matches
    let res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    let matchItem = res.body.find((a: any) => a.attId === validAttId);
    expect(matchItem.documentsUnchangedSinceAttestation).toBe(true);

    // Business replaces GST document (version n+1 with new hash)
    const newGstHash = crypto.createHash('sha256').update('content-gst-v2-replaced').digest('hex');
    documentsDb.set(testDocRefGst, {
      id: 'doc-2-v2',
      docRef: testDocRefGst,
      businessId: testBusinessId,
      contentHash: newGstHash,
      status: 'AVAILABLE',
    });

    // Lookup now detects document modification
    res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    matchItem = res.body.find((a: any) => a.attId === validAttId);
    expect(matchItem.documentsUnchangedSinceAttestation).toBe(false);
  });

  it('Step 10: Revoked or expired consent, inactive institution, and ledger unavailable prevent access (fail closed)', async () => {
    // 10a. Revoked consent denies access
    consentGrantsDb.set(nbfcProfileConsentId, {
      ...consentGrantsDb.get(nbfcProfileConsentId),
      status: 'REVOKED',
    });

    let res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('revoked');

    // Restore consent
    consentGrantsDb.set(nbfcProfileConsentId, {
      ...consentGrantsDb.get(nbfcProfileConsentId),
      status: 'ACTIVE',
    });

    // 10b. Inactive institution denies access (I-5)
    institutionsDb.set(testNbfcInstId, {
      ...institutionsDb.get(testNbfcInstId),
      status: InstitutionStatus.SUSPENDED,
    });

    res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(403);

    // Restore institution
    institutionsDb.set(testNbfcInstId, {
      ...institutionsDb.get(testNbfcInstId),
      status: InstitutionStatus.ACTIVE,
    });

    // 10c. Ledger CheckAccess denial denies access
    ledgerCheckAccessAllowed = false;

    res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(403);
    ledgerCheckAccessAllowed = true;

    // 10d. Ledger unavailable fails closed (I-1)
    ledgerFailClosedError = true;

    res = await request(app.getHttpServer())
      .get(`/api/v1/institution/consents/${nbfcProfileConsentId}/attestations`)
      .set('Cookie', `trustledger_session=${nbfcSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Ledger unreachable');
    ledgerFailClosedError = false;
  });

  it('Step 11: Business owner can view attestations issued for their business', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/business/attestations')
      .set('Cookie', `trustledger_session=${ownerSessionCookie}`)
      .set('x-csrf-token', testCsrfToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
