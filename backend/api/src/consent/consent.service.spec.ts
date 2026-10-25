import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, RequestScopeType, UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LEDGER_SERVICE, LedgerService } from '../ledger/ledger.interface';
import { ShareCodeService } from './share-code.service';
import { RequestsService } from './requests.service';
import { ConsentService } from './consent.service';
import { ReconcilerService } from './reconciler.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

describe('Consent & Share-Code Workflow (Stage 5)', () => {
  let shareCodeService: ShareCodeService;
  let requestsService: RequestsService;
  let consentService: ConsentService;
  let reconcilerService: ReconcilerService;
  let idempotencyService: IdempotencyService;

  let mockPrisma: any;
  let mockAudit: any;
  let mockOtp: any;
  let mockNotifications: any;
  let mockLedger: any;
  let mockConfig: any;

  const testBusinessId = 'biz-unit-123';
  const testBusinessRef = 'biz-ref-unit-123';
  const testOwnerUserId = 'user-owner-123';
  const testOfficerUserId = 'user-officer-123';
  const testInstitutionId = 'inst-bank-123';
  const testMspId = 'BankAOrgMSP';

  beforeEach(async () => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockNotifications = {
      notify: jest.fn().mockResolvedValue(undefined),
    };

    mockOtp = {
      createChallenge: jest.fn().mockResolvedValue({ challengeId: 'test-challenge-uuid' }),
      verifyOtp: jest.fn().mockResolvedValue(true),
    };

    mockLedger = {
      submitTransaction: jest.fn().mockResolvedValue('tx-ledger-uuid-123'),
      evaluateTransaction: jest.fn().mockResolvedValue(JSON.stringify({ allowed: true })),
      checkAccess: jest.fn().mockResolvedValue({ allowed: true }),
    };

    mockPrisma = {
      business: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === testBusinessId || where.businessRef === testBusinessRef) {
            return {
              id: testBusinessId,
              businessRef: testBusinessRef,
              legalName: 'Apex Logistics Pvt Ltd',
              ownerUserId: testOwnerUserId,
            };
          }
          return null;
        }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === testOwnerUserId) {
            return {
              id: testOwnerUserId,
              email: 'owner@apex.example.com',
              phone: '+919876543210',
              role: UserRole.BUSINESS_OWNER,
            };
          }
          if (where.id === testOfficerUserId) {
            return {
              id: testOfficerUserId,
              email: 'kyc@bank.example.com',
              role: UserRole.KYC_OFFICER,
              institutionId: testInstitutionId,
            };
          }
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      institution: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === testInstitutionId) {
            return {
              id: testInstitutionId,
              name: 'State Bank of India',
              mspId: testMspId,
              status: 'ACTIVE',
            };
          }
          return null;
        }),
      },
      profileShareCode: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'sharecode-db-123',
          ...data,
          createdAt: new Date(),
        })),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'sharecode-db-123',
          ...data,
        })),
      },
      accessRequest: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'request-db-123',
          ...data,
          createdAt: new Date(),
        })),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'request-db-123',
          ...data,
        })),
      },
      consentGrant: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'grant-db-123',
          ...data,
          createdAt: new Date(),
        })),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'grant-db-123',
          ...data,
        })),
      },
      accessSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      idempotencyRecord: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      otpChallenge: {
        findUnique: jest.fn(),
      },
      devOutbox: {
        findFirst: jest.fn(),
      },
    };

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEV_OUTBOX') return '1';
        if (key === 'NODE_ENV') return 'development';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShareCodeService,
        RequestsService,
        ConsentService,
        ReconcilerService,
        IdempotencyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: OtpService, useValue: mockOtp },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LEDGER_SERVICE, useValue: mockLedger },
      ],
    }).compile();

    shareCodeService = module.get<ShareCodeService>(ShareCodeService);
    requestsService = module.get<RequestsService>(RequestsService);
    consentService = module.get<ConsentService>(ConsentService);
    reconcilerService = module.get<ReconcilerService>(ReconcilerService);
    idempotencyService = module.get<IdempotencyService>(IdempotencyService);
  });

  describe('ShareCodeService', () => {
    it('should create share-code challenge and issue OTP to business owner with masked destination and dev mode indicator', async () => {
      const res = await shareCodeService.createShareCodeChallenge(
        testBusinessId,
        testOwnerUserId,
        1440,
      );

      expect(res).toHaveProperty('shareCodeId', 'sharecode-db-123');
      expect(res).toHaveProperty('challengeId', 'test-challenge-uuid');
      expect(res).toHaveProperty('deliveryChannel', 'DEV_OUTBOX');
      expect(res).toHaveProperty('deliveryDestinationMasked', '******3210');
      expect(res).toHaveProperty('isDevMode', true);
      expect(res.message).toContain('development outbox');
      expect(mockOtp.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: OtpPurpose.CUSTOMER_APPROVAL,
          subjectUserId: testOwnerUserId,
          boundEntityId: 'sharecode-db-123',
          recipientContact: '+919876543210',
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OTP_ISSUED',
          entityType: 'ProfileShareCode',
        }),
      );
    });

    it('should reject share-code challenge creation if owner has no verified contact details', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'no-contact-user',
        email: '',
        phone: null,
      });
      mockPrisma.business.findUnique.mockResolvedValueOnce({
        id: testBusinessId,
        contact: null,
      });

      await expect(
        shareCodeService.createShareCodeChallenge(testBusinessId, 'no-contact-user', 60),
      ).rejects.toThrow(BadRequestException);
    });

    it('should retrieve active development OTP for the current challenge in development mode', async () => {
      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-123',
        businessId: testBusinessId,
        codeHash: 'PENDING_CONFIRMATION',
        otpChallengeId: 'challenge-123',
        usedAt: null,
      });
      mockPrisma.otpChallenge.findUnique.mockResolvedValue({
        id: 'challenge-123',
        subjectUserId: testOwnerUserId,
        boundEntityId: 'sharecode-db-123',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 4 * 60 * 1000),
        attempts: 1,
      });
      mockPrisma.devOutbox.findFirst.mockResolvedValue({
        recipient: '+919876543210',
        body: 'TrustLedger OTP for CUSTOMER_APPROVAL: 654321 (Challenge ID: challenge-123)',
      });

      const devOtp = await shareCodeService.getDevOtpForShareCode(
        testBusinessId,
        testOwnerUserId,
        'sharecode-db-123',
      );

      expect(devOtp.code).toBe('654321');
      expect(devOtp.status).toBe('ACTIVE');
      expect(devOtp.recipientMasked).toBe('******3210');
      expect(devOtp.attemptsRemaining).toBe(4);
      expect(devOtp.isDevMode).toBe(true);
    });

    it('should reject dev OTP retrieval when NODE_ENV is production (server-side gated)', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEV_OUTBOX') return '1';
        return null;
      });

      await expect(
        shareCodeService.getDevOtpForShareCode(
          testBusinessId,
          testOwnerUserId,
          'sharecode-db-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject dev OTP retrieval if caller is not the owner associated with challenge', async () => {
      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-123',
        businessId: testBusinessId,
        codeHash: 'PENDING_CONFIRMATION',
        otpChallengeId: 'challenge-123',
        usedAt: null,
      });
      mockPrisma.otpChallenge.findUnique.mockResolvedValue({
        id: 'challenge-123',
        subjectUserId: 'other-user-999', // Unrelated user
        boundEntityId: 'sharecode-db-123',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 4 * 60 * 1000),
        attempts: 0,
      });

      await expect(
        shareCodeService.getDevOtpForShareCode(
          testBusinessId,
          testOwnerUserId,
          'sharecode-db-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should resend share-code OTP, update challenge ID, and record audit event', async () => {
      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-123',
        businessId: testBusinessId,
        codeHash: 'PENDING_CONFIRMATION',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
      });
      mockOtp.createChallenge.mockResolvedValue({ challengeId: 'new-challenge-456' });

      const res = await shareCodeService.resendShareCodeOtp(
        testBusinessId,
        testOwnerUserId,
        'sharecode-db-123',
      );

      expect(res.challengeId).toBe('new-challenge-456');
      expect(mockPrisma.profileShareCode.update).toHaveBeenCalledWith({
        where: { id: 'sharecode-db-123' },
        data: { otpChallengeId: 'new-challenge-456' },
      });
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OTP_RESENT',
          entityType: 'ProfileShareCode',
        }),
      );
    });

    it('should confirm share code, verify OTP, generate 8-char Crockford Base32 code and store SHA-256 hash', async () => {
      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-123',
        businessId: testBusinessId,
        codeHash: 'PENDING_CONFIRMATION',
        consentDurationMinutes: 1440,
        otpChallengeId: 'test-challenge-uuid',
        usedAt: null,
      });

      const res = await shareCodeService.confirmShareCode(
        testBusinessId,
        testOwnerUserId,
        'sharecode-db-123',
        '123456',
      );

      expect(mockOtp.verifyOtp).toHaveBeenCalledWith({
        challengeId: 'test-challenge-uuid',
        code: '123456',
        purpose: OtpPurpose.CUSTOMER_APPROVAL,
        subjectUserId: testOwnerUserId,
        boundEntityId: 'sharecode-db-123',
      });

      expect(res.code).toBeDefined();
      expect(res.code).toHaveLength(8);
      // Alphabet check: crockford base32 (32 symbols: 0-9 and A-Z excluding I, L, O, U)
      expect(res.code).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);

      expect(mockPrisma.profileShareCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codeHash: crypto.createHash('sha256').update(res.code).digest('hex'),
          }),
        }),
      );
    });

    it('should reject confirmation if share code is already consumed or confirmed', async () => {
      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-123',
        businessId: testBusinessId,
        codeHash: 'SOME_EXISTING_HASH',
        usedAt: new Date(),
      });

      await expect(
        shareCodeService.confirmShareCode(
          testBusinessId,
          testOwnerUserId,
          'sharecode-db-123',
          '123456',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce S-10 user lockout after 5 redemption attempts in 1 minute', async () => {
      const code = '23456789';
      mockPrisma.profileShareCode.findFirst.mockResolvedValue(null);

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await expect(
          shareCodeService.redeemShareCode(testInstitutionId, testOfficerUserId, code),
        ).rejects.toThrow(NotFoundException);
      }

      // 6th attempt should be blocked with 429
      await expect(
        shareCodeService.redeemShareCode(testInstitutionId, testOfficerUserId, code),
      ).rejects.toThrow(HttpException);
    });

    it('should redeem share code, write ledger CreateConsent, create projection and notify owner', async () => {
      const plainCode = '23456789';
      const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');

      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-123',
        businessId: testBusinessId,
        codeHash,
        consentDurationMinutes: 1440,
        usedAt: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const res = await shareCodeService.redeemShareCode(
        testInstitutionId,
        'user-officer-fresh',
        plainCode,
      );

      expect(res).toHaveProperty('consentId');
      expect(res.business).toHaveProperty('legalName', 'Apex Logistics Pvt Ltd');
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'CreateConsent',
        expect.any(String),
        testBusinessRef,
        testMspId,
        'PROFILE',
        '[]',
        'PROFILE_LOOKUP',
        expect.any(String),
        expect.any(String),
      );
      expect(mockPrisma.consentGrant.create).toHaveBeenCalled();
      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testOwnerUserId,
          type: 'SHARE_CODE_REDEEMED',
        }),
      );
    });

    it('should normalize Crockford Base32 input (O -> 0, I/L -> 1) on redemption (D-19)', async () => {
      // Canonically generated code ending in 0 and 1
      const canonCode = 'ABCD0011';
      const canonHash = crypto.createHash('sha256').update(canonCode).digest('hex');

      mockPrisma.profileShareCode.findFirst.mockResolvedValue({
        id: 'sharecode-db-norm',
        businessId: testBusinessId,
        codeHash: canonHash,
        consentDurationMinutes: 1440,
        usedAt: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // Officer inputs confusing letters 'O' instead of '0', and 'I' / 'L' instead of '1'
      const visualMisreadInput = 'abcdooil'; // lower-case with o and i/l
      const res = await shareCodeService.redeemShareCode(
        testInstitutionId,
        'user-officer-norm',
        visualMisreadInput,
      );

      expect(res).toHaveProperty('consentId');
      expect(mockPrisma.profileShareCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            codeHash: canonHash,
          }),
        }),
      );
    });
  });

  describe('RequestsService', () => {
    it('should reject request creation if active PROFILE consent is missing on-chain (W2 step 3)', async () => {
      mockPrisma.consentGrant.findFirst.mockResolvedValue(null);

      await expect(
        requestsService.createRequest(testInstitutionId, testOfficerUserId, {
          businessId: testBusinessId,
          scopeType: RequestScopeType.DOCUMENTS,
          requestedDocTypes: ['BALANCE_SHEET'],
          purposeCode: 'CREDIT_UNDERWRITING',
          requestedDurationMinutes: 1440,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject request creation if officer role does not match scope requirement', async () => {
      mockPrisma.consentGrant.findFirst.mockResolvedValue({
        consentId: 'consent-profile-123',
        status: 'ACTIVE',
        scopeType: 'PROFILE',
      });

      // LOAN_OFFICER cannot request DOCUMENTS (only KYC_OFFICER can)
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: testOfficerUserId,
        role: UserRole.LOAN_OFFICER,
        institutionId: testInstitutionId,
      });

      await expect(
        requestsService.createRequest(testInstitutionId, testOfficerUserId, {
          businessId: testBusinessId,
          scopeType: RequestScopeType.DOCUMENTS,
          requestedDocTypes: ['BALANCE_SHEET'],
          purposeCode: 'CREDIT_UNDERWRITING',
          requestedDurationMinutes: 1440,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create PENDING request when active PROFILE consent exists and officer has right role', async () => {
      mockPrisma.consentGrant.findFirst.mockResolvedValue({
        consentId: 'consent-profile-123',
        status: 'ACTIVE',
        scopeType: 'PROFILE',
      });

      const res = await requestsService.createRequest(testInstitutionId, testOfficerUserId, {
        businessId: testBusinessId,
        scopeType: RequestScopeType.DOCUMENTS,
        requestedDocTypes: ['BALANCE_SHEET', 'GST_RETURN'],
        purposeCode: 'CREDIT_UNDERWRITING',
        requestedDurationMinutes: 1440,
      });

      expect(res).toBeDefined();
      expect(mockPrisma.accessRequest.create).toHaveBeenCalled();
      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testOwnerUserId,
          type: 'REQUEST_RECEIVED',
        }),
      );
    });

    it('should allow institution officer to cancel a PENDING request', async () => {
      mockPrisma.accessRequest.findFirst.mockResolvedValue({
        id: 'request-db-123',
        institutionId: testInstitutionId,
        businessId: testBusinessId,
        status: 'PENDING',
      });

      await requestsService.cancelRequest(
        testInstitutionId,
        testOfficerUserId,
        'request-db-123',
      );

      expect(mockPrisma.accessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'request-db-123' },
          data: { status: 'CANCELLED' },
        }),
      );
    });

    it('should reject request decision when REJECT is submitted', async () => {
      mockPrisma.accessRequest.findFirst.mockResolvedValue({
        id: 'request-db-123',
        businessId: testBusinessId,
        institutionId: testInstitutionId,
        requestedByUserId: testOfficerUserId,
        status: 'PENDING',
      });

      const res: any = await requestsService.decideRequest(
        testBusinessId,
        testOwnerUserId,
        'request-db-123',
        { decision: 'REJECT' },
      );

      expect(res.status).toBe('REJECTED');
      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testOfficerUserId,
          type: 'REQUEST_DECIDED',
        }),
      );
    });

    it('should reject request when APPROVE is chosen but 0 documents are approved (W2 step 5)', async () => {
      mockPrisma.accessRequest.findFirst.mockResolvedValue({
        id: 'request-db-123',
        businessId: testBusinessId,
        institutionId: testInstitutionId,
        requestedByUserId: testOfficerUserId,
        approvalOtpChallengeId: 'test-challenge-uuid',
        scopeType: 'DOCUMENTS',
        status: 'PENDING',
      });

      const res: any = await requestsService.decideRequest(
        testBusinessId,
        testOwnerUserId,
        'request-db-123',
        {
          decision: 'APPROVE',
          otpCode: '123456',
          approvedDocRefs: [],
        },
      );

      expect(res.status).toBe('REJECTED');
      expect(res.message).toContain('No documents were selected');
    });

    it('should partially approve request when a subset of documents is approved', async () => {
      mockPrisma.accessRequest.findFirst.mockResolvedValue({
        id: 'request-db-123',
        businessId: testBusinessId,
        institutionId: testInstitutionId,
        requestedByUserId: testOfficerUserId,
        approvalOtpChallengeId: 'test-challenge-uuid',
        scopeType: 'DOCUMENTS',
        requestedDocTypes: ['BALANCE_SHEET', 'GST_RETURN'],
        requestedDurationMinutes: 1440,
        purposeCode: 'CREDIT_UNDERWRITING',
        status: 'PENDING',
      });

      const res = await requestsService.decideRequest(
        testBusinessId,
        testOwnerUserId,
        'request-db-123',
        {
          decision: 'APPROVE',
          otpCode: '123456',
          approvedDocRefs: ['doc-ref-balance-sheet'],
        },
      );

      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'CreateConsent',
        expect.any(String),
        testBusinessRef,
        testMspId,
        'DOCUMENTS',
        JSON.stringify(['doc-ref-balance-sheet']),
        'CREDIT_UNDERWRITING',
        expect.any(String),
        expect.any(String),
      );

      expect(mockPrisma.accessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PARTIALLY_APPROVED',
          }),
        }),
      );
    });

    it('should leave request in PENDING state if ledger CreateConsent fails (fail-closed, W2 step 5)', async () => {
      mockPrisma.accessRequest.findFirst.mockResolvedValue({
        id: 'request-db-123',
        businessId: testBusinessId,
        institutionId: testInstitutionId,
        requestedByUserId: testOfficerUserId,
        approvalOtpChallengeId: 'test-challenge-uuid',
        scopeType: 'DOCUMENTS',
        requestedDocTypes: ['BALANCE_SHEET'],
        requestedDurationMinutes: 1440,
        purposeCode: 'CREDIT_UNDERWRITING',
        status: 'PENDING',
      });

      mockLedger.submitTransaction.mockRejectedValueOnce(new Error('Drunix endorsement timeout'));

      await expect(
        requestsService.decideRequest(
          testBusinessId,
          testOwnerUserId,
          'request-db-123',
          {
            decision: 'APPROVE',
            otpCode: '123456',
            approvedDocRefs: ['doc-ref-balance-sheet'],
          },
        ),
      ).rejects.toThrow(BadRequestException);

      // Verify request is NOT updated to APPROVED
      expect(mockPrisma.accessRequest.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
          }),
        }),
      );
    });
  });

  describe('ConsentService & Revocation', () => {
    it('should revoke consent on ledger, update ConsentGrant to REVOKED, and revoke active sessions', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValue({
        id: 'grant-db-123',
        consentId: 'consent-uuid-123',
        businessRef: testBusinessRef,
        institutionId: testInstitutionId,
        status: 'ACTIVE',
        request: {
          requestedByUserId: testOfficerUserId,
        },
      });

      await consentService.revokeConsent(testBusinessId, testOwnerUserId, 'consent-uuid-123');

      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'RevokeConsent',
        'consent-uuid-123',
      );

      expect(mockPrisma.consentGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'grant-db-123' },
          data: { status: 'REVOKED' },
        }),
      );

      expect(mockPrisma.accessSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ consentId: 'consent-uuid-123' }),
          data: { status: 'REVOKED' },
        }),
      );
    });
  });

  describe('ReconcilerService', () => {
    it('should sweep requests older than 7 days and mark them EXPIRED (W2 step 7)', async () => {
      mockPrisma.accessRequest.findMany.mockResolvedValue([
        {
          id: 'req-old-1',
          businessId: testBusinessId,
          institutionId: testInstitutionId,
        },
      ]);

      const count = await reconcilerService.sweepExpiredRequests();
      expect(count).toBe(1);
      expect(mockPrisma.accessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-old-1' },
          data: { status: 'EXPIRED' },
        }),
      );
    });

    it('should rebuild missing projection from ledger (I-2)', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValue(null);

      await reconcilerService.rebuildProjectionFromLedger(
        'consent-orphan-123',
        testBusinessRef,
        testInstitutionId,
        'PROFILE',
        [],
        new Date(),
      );

      expect(mockPrisma.consentGrant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consentId: 'consent-orphan-123',
            businessRef: testBusinessRef,
          }),
        }),
      );
    });

    it('should reconcile database projection when ledger reports consent is REVOKED (I-2)', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValue({
        id: 'grant-rev-123',
        consentId: 'consent-rev-123',
        status: 'ACTIVE',
      });
      mockLedger.checkAccess.mockResolvedValueOnce({
        allowed: false,
        reasonCode: 'CONSENT_REVOKED',
      });

      const result = await reconcilerService.reconcileConsentStatus(
        'consent-rev-123',
        testInstitutionId,
        'PROFILE',
      );

      expect(result).toBe('REVOKED');
      expect(mockPrisma.consentGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'grant-rev-123' },
          data: { status: 'REVOKED' },
        }),
      );
      expect(mockPrisma.accessSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { consentId: 'consent-rev-123', status: { in: ['PENDING_OTP', 'ACTIVE'] } },
          data: { status: 'REVOKED' },
        }),
      );
    });

    it('should reconcile database projection when ledger reports consent is EXPIRED (I-2)', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValue({
        id: 'grant-exp-123',
        consentId: 'consent-exp-123',
        status: 'ACTIVE',
      });
      mockLedger.checkAccess.mockResolvedValueOnce({
        allowed: false,
        reasonCode: 'CONSENT_EXPIRED',
      });

      const result = await reconcilerService.reconcileConsentStatus(
        'consent-exp-123',
        testInstitutionId,
        'PROFILE',
      );

      expect(result).toBe('EXPIRED');
      expect(mockPrisma.consentGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'grant-exp-123' },
          data: { status: 'EXPIRED' },
        }),
      );
    });
  });

  describe('IdempotencyService', () => {
    it('should return cached response if key was already executed successfully', async () => {
      const cached = { status: 'cached-success' };
      const fn = jest.fn().mockResolvedValue(cached);

      // First execution
      const res1 = await idempotencyService.execute('idemp-key-123', fn);
      expect(res1).toEqual(cached);
      expect(fn).toHaveBeenCalledTimes(1);

      // Second execution with same key returns cached response without calling fn
      const res2 = await idempotencyService.execute('idemp-key-123', fn);
      expect(res2).toEqual(cached);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
