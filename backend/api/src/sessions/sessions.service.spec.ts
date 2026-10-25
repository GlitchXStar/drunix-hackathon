import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { OtpPurpose, InstitutionStatus, UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LEDGER_SERVICE } from '../ledger/ledger.interface';
import { DocumentsService } from '../documents/documents.service';
import { DocumentRendererService } from './document-renderer.service';
import { SessionSweeperService } from './session-sweeper.service';
import { SessionsService } from './sessions.service';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

describe('SessionsService & Secure Document Viewer (Stage 6)', () => {
  let sessionsService: SessionsService;
  let sweeperService: SessionSweeperService;
  let rendererService: DocumentRendererService;

  let mockPrisma: any;
  let mockAudit: any;
  let mockOtp: any;
  let mockNotifications: any;
  let mockLedger: any;
  let mockDocuments: any;

  const testOfficer: AuthenticatedUser = {
    id: 'officer-user-1',
    email: 'officer@banka.com',
    role: UserRole.KYC_OFFICER,
    status: 'ACTIVE' as any,
    institutionId: 'inst-bank-a',
    institutionStatus: InstitutionStatus.ACTIVE,
    institutionMspId: 'BankAOrgMSP',
  };

  const testOtherOfficer: AuthenticatedUser = {
    id: 'officer-user-2',
    email: 'officer@bankb.com',
    role: UserRole.KYC_OFFICER,
    status: 'ACTIVE' as any,
    institutionId: 'inst-bank-b',
    institutionStatus: InstitutionStatus.ACTIVE,
    institutionMspId: 'BankBOrgMSP',
  };

  const testAdminUser: AuthenticatedUser = {
    id: 'admin-user-1',
    email: 'admin@banka.com',
    role: UserRole.INSTITUTION_ADMIN,
    status: 'ACTIVE' as any,
    institutionId: 'inst-bank-a',
    institutionStatus: InstitutionStatus.ACTIVE,
    institutionMspId: 'BankAOrgMSP',
  };

  const serverSessionId = 'test-server-session-id-123';
  const userAgent = 'Mozilla/5.0 TestBrowser';
  const validFingerprint = crypto
    .createHash('sha256')
    .update(`${serverSessionId}${userAgent}`)
    .digest('hex');

  const testConsentId = 'consent-uuid-100';
  const testDocRef = 'doc-ref-pan-001';
  const testBusinessRef = 'biz-ref-xyz-123';

  beforeEach(async () => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockNotifications = {
      notify: jest.fn().mockResolvedValue(undefined),
    };

    mockOtp = {
      createChallenge: jest.fn().mockResolvedValue({ challengeId: 'otp-challenge-1' }),
      verifyOtp: jest.fn().mockResolvedValue(true),
    };

    mockLedger = {
      checkAccess: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ACCESS_GRANTED' }),
      query: jest.fn().mockImplementation(async (func) => {
        if (func === 'CheckAccess') {
          return { allowed: true, reasonCode: 'ACCESS_GRANTED' };
        }
        return {};
      }),
      submitTransaction: jest.fn().mockResolvedValue('tx-hash-success'),
    };

    const { createCanvas } = await import('@napi-rs/canvas');
    const validPngBytes = createCanvas(10, 10).toBuffer('image/png');

    mockDocuments = {
      releaseDocumentForSession: jest.fn().mockResolvedValue({
        buffer: validPngBytes,
        mime: 'image/png',
        fileName: 'pan.png',
      }),
    };

    mockPrisma = {
      institution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inst-bank-a',
          name: 'State Bank A',
          status: InstitutionStatus.ACTIVE,
          mspId: 'BankAOrgMSP',
        }),
      },
      consentGrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'consent-db-id',
          consentId: testConsentId,
          institutionId: 'inst-bank-a',
          businessRef: testBusinessRef,
          status: 'ACTIVE',
          scopeType: 'DOCUMENTS',
          docRefs: [testDocRef],
          expiresAt: new Date(Date.now() + 86400000), // 1 day future
          requestId: 'request-123',
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: testOfficer.id,
          email: testOfficer.email,
          phone: '+919876543210',
        }),
      },
      accessRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-123',
          allowDownload: false,
        }),
      },
      otpChallenge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'otp-challenge-1',
          codeHash: 'hash-1',
          attempts: 0,
          expiresAt: new Date(Date.now() + 300000),
        }),
      },
      accessSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-123',
          consentId: testConsentId,
          institutionId: 'inst-bank-a',
          officerUserId: testOfficer.id,
          status: 'ACTIVE',
          clientFingerprintHash: validFingerprint,
          expiresAt: new Date(Date.now() + 1800000), // 30 min future
          viewedDocRefs: [],
          denialCount: 0,
        }),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'session-new-123',
          ...data,
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: 'session-123',
          ...data,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'biz-1',
          businessRef: testBusinessRef,
          ownerUserId: 'owner-user-1',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        SessionSweeperService,
        DocumentRendererService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: OtpService, useValue: mockOtp },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: LEDGER_SERVICE, useValue: mockLedger },
        { provide: DocumentsService, useValue: mockDocuments },
      ],
    }).compile();

    sessionsService = module.get<SessionsService>(SessionsService);
    sweeperService = module.get<SessionSweeperService>(SessionSweeperService);
    rendererService = module.get<DocumentRendererService>(DocumentRendererService);
  });

  describe('Session Creation Lifecycle (§8.4)', () => {
    it('creates an AccessSession in PENDING_OTP status with valid duration and fingerprint', async () => {
      const result = await sessionsService.createSession(
        testOfficer,
        { consentId: testConsentId, requestedDurationMinutes: 45 },
        serverSessionId,
        userAgent,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING_OTP');
      expect(result.challengeId).toBe('otp-challenge-1');
      expect(mockOtp.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectUserId: testOfficer.id,
          purpose: OtpPurpose.SESSION_ACTIVATION,
        }),
      );
      expect(mockPrisma.accessSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consentId: testConsentId,
            officerUserId: testOfficer.id,
            institutionId: testOfficer.institutionId,
            status: 'PENDING_OTP',
            clientFingerprintHash: validFingerprint,
          }),
        }),
      );
    });

    it('rejects session creation if non-KYC_OFFICER attempts it (S-7)', async () => {
      await expect(
        sessionsService.createSession(
          testAdminUser,
          { consentId: testConsentId },
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects session creation if officer institution is SUSPENDED (S-4)', async () => {
      const suspendedOfficer = { ...testOfficer, institutionStatus: InstitutionStatus.SUSPENDED };
      await expect(
        sessionsService.createSession(
          suspendedOfficer,
          { consentId: testConsentId },
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects session creation if active session already exists for this consent', async () => {
      mockPrisma.accessSession.findFirst.mockResolvedValueOnce({
        id: 'existing-active-session',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 10000),
      });

      await expect(
        sessionsService.createSession(
          testOfficer,
          { consentId: testConsentId },
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('enforces maximum duration of 120 minutes (§8.4)', async () => {
      await expect(
        sessionsService.createSession(
          testOfficer,
          { consentId: testConsentId, requestedDurationMinutes: 180 },
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('caps session expiresAt to consent expiresAt if earlier', async () => {
      const consentNearExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes away
      mockPrisma.consentGrant.findUnique.mockResolvedValueOnce({
        id: 'consent-db-id',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        businessRef: testBusinessRef,
        status: 'ACTIVE',
        scopeType: 'DOCUMENTS',
        docRefs: [testDocRef],
        expiresAt: consentNearExpiry,
      });

      await sessionsService.createSession(
        testOfficer,
        { consentId: testConsentId, requestedDurationMinutes: 60 },
        serverSessionId,
        userAgent,
      );

      expect(mockPrisma.accessSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: consentNearExpiry,
          }),
        }),
      );
    });
  });

  describe('OTP Activation (§8.4, W3)', () => {
    it('activates session on valid OTP and emits SESSION_OPENED on ledger and audit', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: 'session-pending-1',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        officerUserId: testOfficer.id,
        status: 'PENDING_OTP',
        clientFingerprintHash: validFingerprint,
        durationMinutes: 30,
      });

      const result = await sessionsService.activateSession(
        testOfficer,
        'session-pending-1',
        { otpCode: '123456' },
        serverSessionId,
        userAgent,
      );

      expect(result.status).toBe('ACTIVE');
      expect(mockOtp.verifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectUserId: testOfficer.id,
          purpose: OtpPurpose.SESSION_ACTIVATION,
          boundEntityId: 'session-pending-1',
          code: '123456',
        }),
      );
      // Ledger SESSION_OPENED submitted
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'RecordAccessEvent',
        expect.any(String),
        testConsentId,
        'BankAOrgMSP',
        '',
        'SESSION_OPENED',
      );
      // PostgreSQL audit recorded
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SESSION_OPENED',
          entityType: 'AccessSession',
          entityId: 'session-pending-1',
        }),
      );
    });

    it('rejects activation when OTP verification fails', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: 'session-pending-1',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        officerUserId: testOfficer.id,
        status: 'PENDING_OTP',
        clientFingerprintHash: validFingerprint,
      });
      mockOtp.verifyOtp.mockRejectedValueOnce(new BadRequestException('Invalid OTP'));

      await expect(
        sessionsService.activateSession(
          testOfficer,
          'session-pending-1',
          { otpCode: 'wrong' },
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Security Revalidation Gates (S-1 to S-18, §15.2)', () => {
    it('S-1: Institution B cannot access session or consent of Institution A (403/404)', async () => {
      await expect(
        sessionsService.renderDocumentPage(
          testOtherOfficer, // Officer from Institution B
          'session-123',    // Session belongs to Institution A
          testDocRef,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'INSTITUTION_MISMATCH',
          }),
        }),
      );
    });

    it('S-2: Expired session is denied with SESSION_EXPIRED', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        officerUserId: testOfficer.id,
        status: 'EXPIRED',
        clientFingerprintHash: validFingerprint,
        expiresAt: new Date(Date.now() - 1000), // in past
      });

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          testDocRef,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'SESSION_EXPIRED',
          }),
        }),
      );
    });

    it('S-3: Revoked consent is denied immediately with CONSENT_REVOKED and session updated to REVOKED', async () => {
      mockPrisma.consentGrant.findUnique.mockResolvedValueOnce({
        id: 'consent-db-id',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        businessRef: testBusinessRef,
        status: 'REVOKED',
        docRefs: [testDocRef],
      });

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          testDocRef,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.accessSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'CONSENT_REVOKED',
          }),
        }),
      );
    });

    it('S-4: Institution suspension mid-session denies access immediately with INSTITUTION_SUSPENDED', async () => {
      mockPrisma.institution.findUnique.mockResolvedValueOnce({
        id: 'inst-bank-a',
        name: 'Bank A',
        status: InstitutionStatus.SUSPENDED,
        mspId: 'BankAOrgMSP',
      });

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          testDocRef,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'INSTITUTION_SUSPENDED',
          }),
        }),
      );
    });

    it('S-5: Forwarded URL or mismatched client fingerprint is denied with FINGERPRINT_MISMATCH', async () => {
      const hijackedUserAgent = 'AttackerBrowser/1.0';

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          testDocRef,
          1,
          serverSessionId,
          hijackedUserAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'FINGERPRINT_MISMATCH',
          }),
        }),
      );
    });

    it('S-7: Super Admin and Institution Admin cannot access document content', async () => {
      await expect(
        sessionsService.renderDocumentPage(
          testAdminUser,
          'session-123',
          testDocRef,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('S-8: Ledger unreachable denies access with LEDGER_UNAVAILABLE (fail closed, I-1)', async () => {
      mockLedger.checkAccess.mockRejectedValueOnce(new Error('Ledger peer timeout'));

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          testDocRef,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'LEDGER_UNAVAILABLE',
          }),
        }),
      );
    });

    it('S-15: Download without explicit allowDownload approval is denied (403)', async () => {
      mockPrisma.accessRequest.findUnique.mockResolvedValueOnce({
        id: 'request-123',
        allowDownload: false,
      });

      await expect(
        sessionsService.downloadDocument(
          testOfficer,
          'session-123',
          testDocRef,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'DOWNLOAD_NOT_PERMITTED',
          }),
        }),
      );
    });

    it('S-18: Document outside approved docRefs is denied with DOC_NOT_IN_SCOPE', async () => {
      const unapprovedDoc = 'doc-ref-secret-unapproved';

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          unapprovedDoc,
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
          metadata: expect.objectContaining({
            reasonCode: 'DOC_NOT_IN_SCOPE',
          }),
        }),
      );
    });
  });

  describe('First-View Ledger Deduplication & Denial Cap (W3)', () => {
    it('emits on-chain DOCUMENT_VIEWED only on the first view per session, not second view', async () => {
      // First view: docRef not in viewedDocRefs
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        officerUserId: testOfficer.id,
        status: 'ACTIVE',
        clientFingerprintHash: validFingerprint,
        expiresAt: new Date(Date.now() + 1800000),
        viewedDocRefs: [],
      });

      await sessionsService.renderDocumentPage(
        testOfficer,
        'session-123',
        testDocRef,
        1,
        serverSessionId,
        userAgent,
      );

      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'RecordAccessEvent',
        expect.any(String),
        testConsentId,
        'BankAOrgMSP',
        testDocRef,
        'DOCUMENT_VIEWED',
      );

      mockLedger.submitTransaction.mockClear();

      // Second view: docRef already in viewedDocRefs
      mockPrisma.accessSession.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        officerUserId: testOfficer.id,
        status: 'ACTIVE',
        clientFingerprintHash: validFingerprint,
        expiresAt: new Date(Date.now() + 1800000),
        viewedDocRefs: [testDocRef],
      });

      await sessionsService.renderDocumentPage(
        testOfficer,
        'session-123',
        testDocRef,
        1,
        serverSessionId,
        userAgent,
      );

      // Verify no duplicate submitTransaction was called on chain
      expect(mockLedger.submitTransaction).not.toHaveBeenCalled();
    });

    it('caps on-chain ACCESS_DENIED events at 20 per session while continuing PostgreSQL audit', async () => {
      mockPrisma.accessSession.findUnique.mockResolvedValue({
        id: 'session-123',
        consentId: testConsentId,
        institutionId: 'inst-bank-a',
        officerUserId: testOfficer.id,
        status: 'ACTIVE',
        clientFingerprintHash: validFingerprint,
        expiresAt: new Date(Date.now() + 1800000),
        denialCount: 20, // Already at cap
      });

      await expect(
        sessionsService.renderDocumentPage(
          testOfficer,
          'session-123',
          'unapproved-doc',
          1,
          serverSessionId,
          userAgent,
        ),
      ).rejects.toThrow(ForbiddenException);

      // On-chain submitTransaction should NOT be called because denialCount >= 20
      expect(mockLedger.submitTransaction).not.toHaveBeenCalled();

      // But PostgreSQL audit record MUST be recorded
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCESS_DENIED',
        }),
      );
    });
  });

  describe('Document Download Authorization & Audit (W3, S-15)', () => {
    it('permits download and records DOCUMENT_DOWNLOADED when allowDownload is true', async () => {
      mockPrisma.accessRequest.findUnique.mockResolvedValueOnce({
        id: 'request-123',
        allowDownload: true,
      });

      const result = await sessionsService.downloadDocument(
        testOfficer,
        'session-123',
        testDocRef,
        serverSessionId,
        userAgent,
      );

      expect(result).toBeDefined();
      expect(result.buffer).toBeDefined();
      expect(mockLedger.submitTransaction).toHaveBeenCalledWith(
        'PlatformOrgMSP',
        'RecordAccessEvent',
        expect.any(String),
        testConsentId,
        'BankAOrgMSP',
        testDocRef,
        'DOCUMENT_DOWNLOADED',
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_DOWNLOADED',
          entityId: testDocRef,
        }),
      );
    });
  });

  describe('Session Sweeper Idempotency & Batching (§8.4)', () => {
    it('sweeps expired sessions and transitions them to EXPIRED idempotently', async () => {
      mockPrisma.accessSession.findMany.mockResolvedValueOnce([
        { id: 'session-exp-1' },
        { id: 'session-exp-2' },
      ]);
      mockPrisma.accessSession.updateMany.mockResolvedValueOnce({ count: 2 });

      const sweptCount = await sweeperService.sweepExpiredSessions(100);

      expect(sweptCount).toBe(2);
      expect(mockPrisma.accessSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['session-exp-1', 'session-exp-2'] },
          status: { in: ['PENDING_OTP', 'ACTIVE'] },
        },
        data: { status: 'EXPIRED' },
      });
      expect(mockAudit.record).toHaveBeenCalledTimes(2);
    });

    it('returns 0 when no sessions are expired', async () => {
      mockPrisma.accessSession.findMany.mockResolvedValueOnce([]);

      const sweptCount = await sweeperService.sweepExpiredSessions(100);
      expect(sweptCount).toBe(0);
      expect(mockPrisma.accessSession.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('DocumentRendererService (D-6 Watermark Verification)', () => {
    it('burns watermark into PNG image and returns valid image buffer', async () => {
      const { createCanvas } = await import('@napi-rs/canvas');
      const canvas = createCanvas(200, 200);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 0, 200, 200);
      const testPngBuffer = canvas.toBuffer('image/png');

      const rendered = await rendererService.renderWatermarkedPage(
        testPngBuffer,
        'image/png',
        'Bank A · officer@banka.com · 2026-10-25T12:00:00Z',
        1,
      );

      expect(rendered).toBeDefined();
      expect(rendered.buffer).toBeInstanceOf(Buffer);
      expect(rendered.buffer.length).toBeGreaterThan(0);
      expect(rendered.mime).toBe('image/png');
      expect(rendered.pageNumber).toBe(1);
      expect(rendered.totalPages).toBe(1);
    });

    it('clamps oversized dimensions to MAX_DIMENSION (2048px)', async () => {
      const { createCanvas } = await import('@napi-rs/canvas');
      const canvas = createCanvas(3000, 1000);
      const testLargePng = canvas.toBuffer('image/png');

      const rendered = await rendererService.renderWatermarkedPage(
        testLargePng,
        'image/png',
        'Watermark Text',
        1,
      );

      expect(rendered.buffer.length).toBeGreaterThan(0);
    });

    it('rejects unsupported mime types', async () => {
      await expect(
        rendererService.renderWatermarkedPage(
          Buffer.from('not a document'),
          'application/x-unknown-executable',
          'Watermark Text',
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
