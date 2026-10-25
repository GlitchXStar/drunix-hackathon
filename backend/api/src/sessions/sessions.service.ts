import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OtpPurpose, InstitutionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService, LEDGER_SERVICE } from '../ledger/ledger.interface';
import { DocumentsService } from '../documents/documents.service';
import { DocumentRendererService } from './document-renderer.service';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateSessionDto } from './dto/create-session.dto';
import { ActivateSessionDto } from './dto/activate-session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly otpService: OtpService,
    private readonly notificationsService: NotificationsService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
    private readonly documentsService: DocumentsService,
    private readonly rendererService: DocumentRendererService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * Computes client fingerprint: SHA-256(serverSessionId || userAgent) (SPEC §8.4)
   */
  public computeFingerprint(serverSessionId: string, userAgent: string): string {
    return crypto
      .createHash('sha256')
      .update(`${serverSessionId || ''}${userAgent || ''}`)
      .digest('hex');
  }

  /**
   * Helper to record an access denial audit event and on-chain event (capped at 20 per session)
   */
  private async recordDenial(
    session: any,
    officer: AuthenticatedUser,
    reasonCode: string,
    docRef = '',
  ): Promise<void> {
    const institutionId = session?.institutionId || officer.institutionId;

    // 1. Audit trail record in PostgreSQL
    await this.auditService.record({
      actor: officer.id,
      institutionId,
      action: 'ACCESS_DENIED',
      entityType: session ? 'AccessSession' : 'Document',
      entityId: session?.id || docRef || 'unknown',
      metadata: {
        reasonCode,
        docRef,
        sessionId: session?.id,
      },
    });

    // 2. On-chain ACCESS_DENIED event (up to 20 per session per W3)
    if (session && session.consentId && (session.denialCount ?? 0) < 20) {
      try {
        await this.prisma.accessSession.update({
          where: { id: session.id },
          data: { denialCount: { increment: 1 } },
        });

        const eventId = uuidv4();
        const mspId = officer.institutionMspId || 'BankAOrgMSP';
        await this.ledgerService.submitTransaction(
          'PlatformOrgMSP',
          'RecordAccessEvent',
          eventId,
          session.consentId,
          mspId,
          docRef,
          'ACCESS_DENIED',
        );
      } catch (err) {
        this.logger.warn(`Failed to record on-chain ACCESS_DENIED event: ${err}`);
      }
    }
  }

  /**
   * Section 8.4, 10 (W3): Create AccessSession in PENDING_OTP status
   */
  async createSession(
    officer: AuthenticatedUser,
    dto: CreateSessionDto,
    serverSessionId: string,
    userAgent: string,
  ) {
    if (officer.role !== UserRole.KYC_OFFICER) {
      throw new ForbiddenException('Only KYC_OFFICER role can create an AccessSession');
    }

    if (!officer.institutionId || officer.institutionStatus !== InstitutionStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Your institution is not active',
      });
    }

    let consent = await this.prisma.consentGrant.findUnique({
      where: { consentId: dto.consentId },
    });

    if (!consent) {
      throw new NotFoundException({
        code: 'CONSENT_NOT_FOUND',
        message: 'Consent grant not found',
      });
    }

    if (consent.institutionId !== officer.institutionId) {
      throw new ForbiddenException({
        code: 'INSTITUTION_MISMATCH',
        message: 'Consent was not granted to your institution',
      });
    }

    const now = new Date();
    if (consent.scopeType !== 'DOCUMENTS') {
      const docConsent = await this.prisma.consentGrant.findFirst({
        where: {
          businessRef: consent.businessRef,
          institutionId: officer.institutionId,
          scopeType: 'DOCUMENTS',
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (docConsent) {
        consent = docConsent;
      } else {
        throw new BadRequestException({
          code: 'SCOPE_MISMATCH',
          message:
            'AccessSessions can only be created for DOCUMENTS scope consents. The provided ID is a PROFILE consent and no approved DOCUMENTS consent exists yet for this business.',
        });
      }
    }
    if (consent.status === 'REVOKED') {
      throw new ForbiddenException({
        code: 'CONSENT_REVOKED',
        message: 'Consent has been revoked',
      });
    }

    if (consent.status === 'EXPIRED' || consent.expiresAt <= now) {
      throw new ForbiddenException({
        code: 'CONSENT_EXPIRED',
        message: 'Consent has expired',
      });
    }

    // Check one active session per officer per consent (SPEC §8.4)
    const existingActive = await this.prisma.accessSession.findFirst({
      where: {
        consentId: dto.consentId,
        officerUserId: officer.id,
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
    });

    if (existingActive) {
      throw new ConflictException({
        code: 'ACTIVE_SESSION_EXISTS',
        message: 'You already hold an active session for this consent',
      });
    }

    // Ledger-first verification (I-1 fail closed)
    let accessCheck;
    try {
      accessCheck = await this.ledgerService.checkAccess(
        consent.consentId,
        officer.institutionMspId || 'BankAOrgMSP',
        'DOCUMENTS',
        consent.docRefs?.[0],
      );
    } catch (err) {
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: 'Ledger unreachable during access check (I-1 fail closed)',
      });
    }

    if (!accessCheck || !accessCheck.allowed) {
      const code = accessCheck?.reasonCode || 'ACCESS_DENIED';
      throw new ForbiddenException({
        code,
        message: `Ledger access denied: ${code}`,
      });
    }

    // Duration: default 30 min, maximum 120 min (SPEC §8.4)
    if (dto.requestedDurationMinutes && (dto.requestedDurationMinutes > 120 || dto.requestedDurationMinutes < 1)) {
      throw new BadRequestException('Session duration must be between 1 and 120 minutes (SPEC §8.4)');
    }
    const requestedDuration = dto.requestedDurationMinutes || 30;
    const expiresAt = new Date(
      Math.min(consent.expiresAt.getTime(), now.getTime() + requestedDuration * 60 * 1000),
    );

    const clientFingerprintHash = this.computeFingerprint(serverSessionId, userAgent);

    // Create session in PENDING_OTP
    const session = await this.prisma.accessSession.create({
      data: {
        consentId: consent.consentId,
        officerUserId: officer.id,
        institutionId: officer.institutionId,
        status: 'PENDING_OTP',
        expiresAt,
        clientFingerprintHash,
        viewedDocRefs: [],
        denialCount: 0,
      },
    });

    // Fetch officer contact for OTP delivery
    const user = await this.prisma.user.findUnique({ where: { id: officer.id } });
    const recipientContact = user?.phone || user?.email || officer.email;

    // Issue SESSION_ACTIVATION OTP challenge bound to accessSessionId
    const challenge = await this.otpService.createChallenge({
      purpose: OtpPurpose.SESSION_ACTIVATION,
      subjectUserId: officer.id,
      boundEntityId: session.id,
      recipientContact,
    });

    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'OTP_ISSUED',
      entityType: 'AccessSession',
      entityId: session.id,
      metadata: {
        consentId: consent.consentId,
        purpose: 'SESSION_ACTIVATION',
      },
    });

    const isDevMode =
      this.configService?.get<string>('DEV_OUTBOX') === '1' &&
      this.configService?.get<string>('NODE_ENV') !== 'production';

    return {
      id: session.id,
      sessionId: session.id,
      consentId: consent.consentId,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      challengeId: challenge.challengeId,
      deliveryChannel: isDevMode ? ('DEV_OUTBOX' as const) : ('SMS' as const),
      deliveryDestinationMasked: this.maskContact(recipientContact),
      isDevMode,
      message: isDevMode
        ? 'Real SMS/email delivery is not configured in this environment. Local testing uses the development outbox.'
        : `Activation OTP sent to ${this.maskContact(recipientContact)}.`,
    };
  }

  /**
   * Masks phone numbers (e.g. ******3210) and emails (e.g. o***@domain.com)
   */
  maskContact(contact: string): string {
    if (!contact) return '';
    const trimmed = contact.trim();
    if (trimmed.includes('@')) {
      const atIdx = trimmed.indexOf('@');
      const local = trimmed.slice(0, atIdx);
      const domain = trimmed.slice(atIdx + 1);
      if (!local || !domain) return trimmed;
      const maskedLocal = local.length > 1 ? `${local[0]}***` : `${local}***`;
      return `${maskedLocal}@${domain}`;
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 4) {
      const last4 = digits.slice(-4);
      return `******${last4}`;
    }
    return '******';
  }

  /**
   * Retrieve local development OTP for active session activation challenge
   */
  async getDevOtpForSession(officer: AuthenticatedUser, sessionId: string) {
    const isDevMode =
      this.configService?.get<string>('DEV_OUTBOX') === '1' &&
      this.configService?.get<string>('NODE_ENV') !== 'production';

    if (!isDevMode) {
      throw new ForbiddenException(
        'Development OTP retrieval is disabled in production or when DEV_OUTBOX!=1',
      );
    }

    const session = await this.prisma.accessSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.officerUserId !== officer.id || session.institutionId !== officer.institutionId) {
      throw new ForbiddenException('Unauthorized access to session');
    }

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        boundEntityId: session.id,
        purpose: OtpPurpose.SESSION_ACTIVATION,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      return {
        code: null,
        status: 'PENDING' as const,
        message: 'No OTP challenge found for this session.',
      };
    }

    if (challenge.consumedAt) {
      return {
        code: null,
        status: 'CONSUMED' as const,
        message: 'This OTP has already been verified and consumed.',
      };
    }

    const now = new Date();
    if (challenge.expiresAt < now) {
      return {
        code: null,
        status: 'EXPIRED' as const,
        message: 'This OTP has expired. Please create a new session.',
      };
    }

    if (challenge.attempts >= 5) {
      return {
        code: null,
        status: 'LOCKED' as const,
        message: 'Maximum verification attempts exceeded.',
      };
    }

    const outboxEntry = await this.prisma.devOutbox.findFirst({
      where: {
        body: {
          contains: challenge.id,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!outboxEntry) {
      return {
        code: null,
        status: 'PENDING' as const,
        message: 'OTP is being processed in outbox...',
      };
    }

    const match = outboxEntry.body.match(/\b(\d{6})\b/);
    const code = match ? match[1] : null;

    return {
      code,
      status: 'ACTIVE' as const,
      expiresAt: challenge.expiresAt.toISOString(),
      attemptsRemaining: Math.max(0, 5 - challenge.attempts),
      recipientMasked: this.maskContact(outboxEntry.recipient),
      channel: 'DEV_OUTBOX',
      isDevMode: true,
      message: 'Development OTP retrieved for testing',
    };
  }

  /**
   * Section 8.4, 10 (W3): Activate session with OTP
   */
  async activateSession(
    officer: AuthenticatedUser,
    sessionId: string,
    dto: ActivateSessionDto,
    serverSessionId: string,
    userAgent: string,
  ) {
    const session = await this.prisma.accessSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Access session not found');
    }

    if (session.officerUserId !== officer.id || session.institutionId !== officer.institutionId) {
      throw new ForbiddenException('Access denied: You do not own this session');
    }

    if (session.status !== 'PENDING_OTP') {
      throw new BadRequestException(`Session cannot be activated from status ${session.status}`);
    }

    const currentFingerprint = this.computeFingerprint(serverSessionId, userAgent);
    if (currentFingerprint !== session.clientFingerprintHash) {
      await this.recordDenial(session, officer, 'FINGERPRINT_MISMATCH');
      throw new ForbiddenException({
        code: 'FINGERPRINT_MISMATCH',
        message: 'Session cannot be activated from a different browser or login session (S-5)',
      });
    }

    const now = new Date();
    if (session.expiresAt <= now) {
      await this.prisma.accessSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      await this.recordDenial(session, officer, 'SESSION_EXPIRED');
      throw new ForbiddenException({
        code: 'SESSION_EXPIRED',
        message: 'Session activation time window has expired',
      });
    }

    // Re-verify institution status
    if (officer.institutionStatus !== InstitutionStatus.ACTIVE) {
      await this.recordDenial(session, officer, 'INSTITUTION_SUSPENDED');
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Institution is suspended',
      });
    }

    // Re-verify consent status
    const consent = await this.prisma.consentGrant.findUnique({
      where: { consentId: session.consentId },
    });
    if (!consent || consent.status === 'REVOKED') {
      await this.recordDenial(session, officer, 'CONSENT_REVOKED');
      throw new ForbiddenException({
        code: 'CONSENT_REVOKED',
        message: 'Consent has been revoked',
      });
    }
    if (consent.status === 'EXPIRED' || consent.expiresAt <= now) {
      await this.recordDenial(session, officer, 'CONSENT_EXPIRED');
      throw new ForbiddenException({
        code: 'CONSENT_EXPIRED',
        message: 'Consent has expired',
      });
    }

    // Ledger-first check (I-1)
    let accessCheck;
    try {
      accessCheck = await this.ledgerService.checkAccess(
        consent.consentId,
        officer.institutionMspId || 'BankAOrgMSP',
        'DOCUMENTS',
        consent.docRefs?.[0],
      );
    } catch (err) {
      await this.recordDenial(session, officer, 'LEDGER_UNAVAILABLE');
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: 'Ledger unreachable during access check (I-1 fail closed)',
      });
    }

    if (!accessCheck || !accessCheck.allowed) {
      const code = accessCheck?.reasonCode || 'ACCESS_DENIED';
      await this.recordDenial(session, officer, code);
      throw new ForbiddenException({
        code,
        message: `Ledger access denied: ${code}`,
      });
    }

    // Find the latest active OTP challenge bound to this session
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        boundEntityId: session.id,
        purpose: OtpPurpose.SESSION_ACTIVATION,
        subjectUserId: officer.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.consumedAt) {
      throw new BadRequestException('No active activation OTP challenge found for this session');
    }

    // Verify OTP
    await this.otpService.verifyOtp({
      challengeId: challenge.id,
      code: dto.otpCode,
      purpose: OtpPurpose.SESSION_ACTIVATION,
      subjectUserId: officer.id,
      boundEntityId: session.id,
    });

    // Calculate active session expiry: 30 minutes from activation (or up to consent expiry)
    const activeExpiresAt = new Date(
      Math.min(consent.expiresAt.getTime(), now.getTime() + 30 * 60 * 1000),
    );

    const updated = await this.prisma.accessSession.update({
      where: { id: session.id },
      data: {
        status: 'ACTIVE',
        activatedAt: now,
        expiresAt: activeExpiresAt,
      },
    });

    // Record on-chain SESSION_OPENED event
    const eventId = uuidv4();
    try {
      await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'RecordAccessEvent',
        eventId,
        session.consentId,
        officer.institutionMspId || 'BankAOrgMSP',
        '',
        'SESSION_OPENED',
      );
    } catch (err) {
      this.logger.error(`Failed to record on-chain SESSION_OPENED:`, err);
      // Fail closed or note consistency
    }

    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'SESSION_OPENED',
      entityType: 'AccessSession',
      entityId: session.id,
      metadata: {
        consentId: session.consentId,
        activatedAt: now.toISOString(),
        expiresAt: activeExpiresAt.toISOString(),
      },
    });

    // Notify business owner that session was opened (SPEC §14.2)
    const business = await this.prisma.business.findUnique({
      where: { businessRef: consent.businessRef },
    });
    if (business) {
      await this.notificationsService.notify({
        userId: business.ownerUserId,
        type: 'SESSION_OPENED',
        entityType: 'AccessSession',
        entityId: session.id,
      });
    }

    return {
      sessionId: updated.id,
      consentId: updated.consentId,
      status: updated.status,
      activatedAt: updated.activatedAt?.toISOString(),
      expiresAt: updated.expiresAt.toISOString(),
      message: 'AccessSession activated successfully',
    };
  }

  /**
   * Section 8.4: Explicit session closure by officer
   */
  async closeSession(officer: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.accessSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Access session not found');
    }

    if (session.officerUserId !== officer.id || session.institutionId !== officer.institutionId) {
      throw new ForbiddenException('Access denied: You do not own this session');
    }

    const updated = await this.prisma.accessSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED' },
    });

    // Record on-chain SESSION_CLOSED event
    const eventId = uuidv4();
    try {
      await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'RecordAccessEvent',
        eventId,
        session.consentId,
        officer.institutionMspId || 'BankAOrgMSP',
        '',
        'SESSION_CLOSED',
      );
    } catch (err) {
      this.logger.warn(`Failed to record on-chain SESSION_CLOSED: ${err}`);
    }

    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'SESSION_CLOSED',
      entityType: 'AccessSession',
      entityId: session.id,
    });

    return {
      success: true,
      sessionId: updated.id,
      status: updated.status,
      message: 'AccessSession closed successfully',
    };
  }

  /**
   * Section 3 & W3: Full 8-point authorization check executed on EVERY document request
   */
  async revalidateSessionAccess(
    officer: AuthenticatedUser,
    sessionId: string,
    serverSessionId: string,
    userAgent: string,
    docRef?: string,
  ): Promise<{ session: any; consent: any }> {
    // 1. Role check: only KYC_OFFICER can view or download documents in session
    if (officer.role !== UserRole.KYC_OFFICER) {
      throw new ForbiddenException('Only KYC_OFFICER can access document content');
    }

    // 2. Fetch session
    const session = await this.prisma.accessSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Access session not found',
      });
    }

    // Tenant check
    if (session.institutionId !== officer.institutionId || session.officerUserId !== officer.id) {
      await this.recordDenial(session, officer, 'INSTITUTION_MISMATCH', docRef);
      throw new ForbiddenException({
        code: 'INSTITUTION_MISMATCH',
        message: 'Cross-institution session access denied (S-1)',
      });
    }

    // 3. Browser & Login Session Fingerprint check (S-5)
    const currentFingerprint = this.computeFingerprint(serverSessionId, userAgent);
    if (currentFingerprint !== session.clientFingerprintHash) {
      await this.recordDenial(session, officer, 'FINGERPRINT_MISMATCH', docRef);
      throw new ForbiddenException({
        code: 'FINGERPRINT_MISMATCH',
        message: 'Session cannot be accessed from a different browser or forwarded URL (S-5)',
      });
    }

    const now = new Date();

    // 4. Session status & expiry check (S-2)
    if (session.status === 'EXPIRED' || session.expiresAt <= now) {
      if (session.status !== 'EXPIRED') {
        await this.prisma.accessSession.update({
          where: { id: session.id },
          data: { status: 'EXPIRED' },
        });
      }
      await this.recordDenial(session, officer, 'SESSION_EXPIRED', docRef);
      throw new ForbiddenException({
        code: 'SESSION_EXPIRED',
        message: 'Access session has expired (S-2)',
      });
    }

    if (session.status !== 'ACTIVE') {
      await this.recordDenial(session, officer, 'SESSION_NOT_ACTIVE', docRef);
      throw new ForbiddenException({
        code: 'SESSION_NOT_ACTIVE',
        message: `Session is ${session.status}, not ACTIVE`,
      });
    }

    // 5. Institution status check (S-4)
    const inst = await this.prisma.institution.findUnique({
      where: { id: officer.institutionId },
    });
    if (!inst || inst.status !== InstitutionStatus.ACTIVE) {
      await this.recordDenial(session, officer, 'INSTITUTION_SUSPENDED', docRef);
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Institution is suspended (S-4)',
      });
    }

    // 6. Consent status, scope and expiry check (S-3)
    const consent = await this.prisma.consentGrant.findUnique({
      where: { consentId: session.consentId },
    });
    if (!consent) {
      await this.recordDenial(session, officer, 'CONSENT_NOT_FOUND', docRef);
      throw new NotFoundException({
        code: 'CONSENT_NOT_FOUND',
        message: 'Consent grant not found',
      });
    }

    if (consent.status === 'REVOKED') {
      await this.prisma.accessSession.update({
        where: { id: session.id },
        data: { status: 'REVOKED' },
      });
      await this.recordDenial(session, officer, 'CONSENT_REVOKED', docRef);
      throw new ForbiddenException({
        code: 'CONSENT_REVOKED',
        message: 'Consent has been revoked by business owner (S-3)',
      });
    }

    if (consent.status === 'EXPIRED' || consent.expiresAt <= now) {
      await this.recordDenial(session, officer, 'CONSENT_EXPIRED', docRef);
      throw new ForbiddenException({
        code: 'CONSENT_EXPIRED',
        message: 'Consent has expired',
      });
    }

    // 7. Document membership check (S-18)
    if (docRef) {
      if (!consent.docRefs.includes(docRef)) {
        await this.recordDenial(session, officer, 'DOC_NOT_IN_SCOPE', docRef);
        throw new ForbiddenException({
          code: 'DOC_NOT_IN_SCOPE',
          message: 'Requested document is not approved within this consent scope (S-18)',
        });
      }
    }

    // 8. Fresh Ledger CheckAccess evaluation (I-1 fail closed, S-8)
    let accessCheck;
    try {
      accessCheck = await this.ledgerService.checkAccess(
        consent.consentId,
        inst.mspId,
        'DOCUMENTS',
        docRef,
      );
    } catch (err) {
      await this.recordDenial(session, officer, 'LEDGER_UNAVAILABLE', docRef);
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: 'Ledger unreachable during access check (I-1 fail closed)',
      });
    }

    if (!accessCheck || !accessCheck.allowed) {
      const code = accessCheck?.reasonCode || 'ACCESS_DENIED';
      await this.recordDenial(session, officer, code, docRef);
      throw new ForbiddenException({
        code,
        message: `Ledger authorization denied: ${code}`,
      });
    }

    return { session, consent };
  }

  /**
   * Section 11.2: List approved documents in active session
   */
  async getSessionDocuments(
    officer: AuthenticatedUser,
    sessionId: string,
    serverSessionId: string,
    userAgent: string,
  ) {
    const { consent } = await this.revalidateSessionAccess(
      officer,
      sessionId,
      serverSessionId,
      userAgent,
    );

    const docs = await this.prisma.document.findMany({
      where: {
        docRef: { in: consent.docRefs },
        status: { not: 'DELETED' },
      },
      select: {
        id: true,
        docRef: true,
        docType: true,
        mime: true,
        sizeBytes: true,
        version: true,
        status: true,
        createdAt: true,
      },
    });

    return docs;
  }

  /**
   * Section 7, 8.4, 10 (W3), D-6: Render watermarked page image
   */
  async renderDocumentPage(
    officer: AuthenticatedUser,
    sessionId: string,
    docRef: string,
    pageNumber: number,
    serverSessionId: string,
    userAgent: string,
  ) {
    const { session, consent } = await this.revalidateSessionAccess(
      officer,
      sessionId,
      serverSessionId,
      userAgent,
      docRef,
    );

    const institutionId = (officer.institutionId || session.institutionId)!;

    // Release document in-memory (authenticates DEK, decrypts, and verifies hash)
    const decrypted = await this.documentsService.releaseDocumentForSession(
      consent.consentId,
      institutionId,
      docRef,
    );

    // Emit on-chain DOCUMENT_VIEWED only for the first view of each document per session (W3)
    const viewedDocRefs: string[] = session.viewedDocRefs || [];
    if (!viewedDocRefs.includes(docRef)) {
      try {
        await this.prisma.accessSession.update({
          where: { id: session.id },
          data: { viewedDocRefs: { push: docRef } },
        });

        const eventId = uuidv4();
        await this.ledgerService.submitTransaction(
          'PlatformOrgMSP',
          'RecordAccessEvent',
          eventId,
          consent.consentId,
          officer.institutionMspId || 'BankAOrgMSP',
          docRef,
          'DOCUMENT_VIEWED',
        );
      } catch (err) {
        this.logger.error(`Failed to record on-chain DOCUMENT_VIEWED event:`, err);
      }
    }

    // Fetch institution name for watermark
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    const institutionName = institution?.name || 'Institution';
    const timestampUtc = new Date().toISOString();

    // Watermark specification (D-6): institution, officer email, timestamp
    const watermarkText = `${institutionName} · ${officer.email} · ${timestampUtc}`;

    // Render watermarked page image (burns watermark into the pixels)
    const rendered = await this.rendererService.renderWatermarkedPage(
      decrypted.buffer,
      decrypted.mime,
      watermarkText,
      pageNumber,
    );

    // Operational audit record in PostgreSQL
    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'DOCUMENT_VIEWED',
      entityType: 'Document',
      entityId: docRef,
      metadata: {
        sessionId: session.id,
        consentId: consent.consentId,
        pageNumber,
        mime: rendered.mime,
      },
    });

    // Notify business owner (SPEC §14.2)
    const business = await this.prisma.business.findUnique({
      where: { businessRef: consent.businessRef },
    });
    if (business) {
      await this.notificationsService.notify({
        userId: business.ownerUserId,
        type: 'DOCUMENT_VIEWED',
        entityType: 'Document',
        entityId: docRef,
      });
    }

    return rendered;
  }

  /**
   * Section 7, 8.4, 10 (W3), D-6, S-15: Download original document binary (only if approved)
   */
  async downloadDocument(
    officer: AuthenticatedUser,
    sessionId: string,
    docRef: string,
    serverSessionId: string,
    userAgent: string,
  ) {
    const { session, consent } = await this.revalidateSessionAccess(
      officer,
      sessionId,
      serverSessionId,
      userAgent,
      docRef,
    );

    // Check if the business owner approved original file downloads for this consent (D-6, S-15)
    let allowDownload = false;
    if (consent.requestId) {
      const request = await this.prisma.accessRequest.findUnique({
        where: { id: consent.requestId },
      });
      allowDownload = request?.allowDownload === true;
    }

    if (!allowDownload) {
      await this.recordDenial(session, officer, 'DOWNLOAD_NOT_PERMITTED', docRef);
      throw new ForbiddenException({
        code: 'DOWNLOAD_NOT_PERMITTED',
        message: 'Download was not approved by the business owner for this consent (S-15)',
      });
    }

    const institutionId = (officer.institutionId || session.institutionId)!;

    // Release document in-memory
    const decrypted = await this.documentsService.releaseDocumentForSession(
      consent.consentId,
      institutionId,
      docRef,
    );

    // Record on-chain DOCUMENT_DOWNLOADED event (every download is recorded per W3)
    const eventId = uuidv4();
    try {
      await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'RecordAccessEvent',
        eventId,
        consent.consentId,
        officer.institutionMspId || 'BankAOrgMSP',
        docRef,
        'DOCUMENT_DOWNLOADED',
      );
    } catch (err) {
      this.logger.error(`Failed to record on-chain DOCUMENT_DOWNLOADED event:`, err);
    }

    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'Document',
      entityId: docRef,
      metadata: {
        sessionId: session.id,
        consentId: consent.consentId,
        sizeBytes: decrypted.buffer.length,
      },
    });

    const business = await this.prisma.business.findUnique({
      where: { businessRef: consent.businessRef },
    });
    if (business) {
      await this.notificationsService.notify({
        userId: business.ownerUserId,
        type: 'DOCUMENT_DOWNLOADED',
        entityType: 'Document',
        entityId: docRef,
      });
    }

    return decrypted;
  }
}
