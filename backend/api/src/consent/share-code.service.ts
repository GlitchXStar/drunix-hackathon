import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OtpPurpose, InstitutionStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { OtpService } from '../otp/otp.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService, LEDGER_SERVICE } from '../ledger/ledger.interface';

// Unambiguous 32-character alphabet (SPEC 10 W2: Crockford Base32: 0-9 and A-Z excluding I, L, O, U)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class ShareCodeService {
  private readonly logger = new Logger(ShareCodeService.name);

  // Rate limit buckets (SPEC 8.5 & S-10: 5/min per user, 20/hr per institution)
  private readonly userAttempts = new Map<string, RateLimitBucket>();
  private readonly instAttempts = new Map<string, RateLimitBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Helper to generate cryptographically secure 8-character code from unambiguous alphabet
   */
  private generateSecureCode(): string {
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return code;
  }

  /**
   * SPEC 8.5 & S-10: Rate limit checking for share-code redemption
   */
  private checkRedemptionRateLimit(userId: string, instId: string): void {
    const now = Date.now();

    // 1. User check: 5 attempts per minute
    let userBucket = this.userAttempts.get(userId);
    if (!userBucket || now > userBucket.resetAt) {
      userBucket = { count: 0, resetAt: now + 60 * 1000 };
      this.userAttempts.set(userId, userBucket);
    }
    if (userBucket.count >= 5) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many redemption attempts for this user. Locked out for 1 minute (S-10).',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    userBucket.count++;

    // 2. Institution check: 20 attempts per hour
    let instBucket = this.instAttempts.get(instId);
    if (!instBucket || now > instBucket.resetAt) {
      instBucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
      this.instAttempts.set(instId, instBucket);
    }
    if (instBucket.count >= 20) {
      throw new HttpException(
        {
          code: 'INSTITUTION_RATE_LIMIT_EXCEEDED',
          message: 'Too many redemption attempts for this institution. Locked out for 1 hour (S-10).',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    instBucket.count++;
  }

  /**
   * Step 1 (W2): Owner requests code with desired consent duration; issues OTP challenge
   */
  async createShareCodeChallenge(
    businessId: string,
    ownerUserId: string,
    durationMinutes = 10080, // Default 7 days
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Cap duration at 30 days (ledger rule)
    const effectiveDuration = Math.min(Math.max(durationMinutes, 1), 43200);

    // Create preliminary share-code record with placeholder hash
    const shareCode = await this.prisma.profileShareCode.create({
      data: {
        businessId,
        codeHash: 'PENDING_CONFIRMATION',
        consentDurationMinutes: effectiveDuration,
        otpChallengeId: '',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 min code lifetime
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
    });
    const recipientContact = user?.phone || user?.email || 'owner@example.com';

    // Issue CUSTOMER_APPROVAL OTP bound to shareCodeId
    const challenge = await this.otpService.createChallenge({
      purpose: OtpPurpose.CUSTOMER_APPROVAL,
      subjectUserId: ownerUserId,
      boundEntityId: shareCode.id,
      recipientContact,
    });

    // Update challenge ID
    await this.prisma.profileShareCode.update({
      where: { id: shareCode.id },
      data: { otpChallengeId: challenge.challengeId },
    });

    await this.auditService.record({
      actor: ownerUserId,
      action: 'OTP_ISSUED',
      entityType: 'ProfileShareCode',
      entityId: shareCode.id,
      businessId,
      metadata: { purpose: 'CUSTOMER_APPROVAL', boundEntityId: shareCode.id },
    });

    return {
      shareCodeId: shareCode.id,
      challengeId: challenge.challengeId,
      message: 'OTP challenge issued to owner for share code creation',
    };
  }

  /**
   * Step 2 (W2): Owner verifies OTP; receives 8-char code (shown once, only codeHash stored)
   */
  async confirmShareCode(
    businessId: string,
    ownerUserId: string,
    shareCodeId: string,
    otpCode: string,
  ) {
    const shareCode = await this.prisma.profileShareCode.findFirst({
      where: { id: shareCodeId, businessId },
    });
    if (!shareCode) {
      throw new NotFoundException('Share code request not found');
    }
    if (shareCode.usedAt || shareCode.codeHash !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Share code has already been confirmed or consumed');
    }

    // Verify OTP bound to this shareCodeId
    await this.otpService.verifyOtp({
      challengeId: shareCode.otpChallengeId,
      code: otpCode,
      purpose: OtpPurpose.CUSTOMER_APPROVAL,
      subjectUserId: ownerUserId,
      boundEntityId: shareCode.id,
    });

    // Generate unambiguous 8-char code
    const rawCode = this.generateSecureCode();
    const codeHash = crypto
      .createHash('sha256')
      .update(rawCode.toUpperCase())
      .digest('hex');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min lifetime

    await this.prisma.profileShareCode.update({
      where: { id: shareCode.id },
      data: {
        codeHash,
        expiresAt,
      },
    });

    await this.auditService.record({
      actor: ownerUserId,
      action: 'SHARE_CODE_CREATED',
      entityType: 'ProfileShareCode',
      entityId: shareCode.id,
      businessId,
      metadata: {
        shareCodeId: shareCode.id,
        consentDurationMinutes: shareCode.consentDurationMinutes,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // Code is returned once to owner
    return {
      code: rawCode,
      shareCodeId: shareCode.id,
      expiresAt: expiresAt.toISOString(),
      consentDurationMinutes: shareCode.consentDurationMinutes,
    };
  }

  /**
   * Step 3 (W2): Institution officer redeems share code (Rate-limited per S-10, creates PROFILE consent)
   */
  async redeemShareCode(
    institutionId: string,
    officerUserId: string,
    code: string,
  ) {
    if (!code || code.length !== 8) {
      throw new BadRequestException('Invalid share code format: must be 8 characters');
    }

    // Enforce S-10 rate limits
    this.checkRedemptionRateLimit(officerUserId, institutionId);

    // Crockford Base32 normalization per ADR D-19 (map O -> 0, I/L -> 1)
    const normalizedCode = code
      .trim()
      .toUpperCase()
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');

    const codeHash = crypto
      .createHash('sha256')
      .update(normalizedCode)
      .digest('hex');

    const now = new Date();

    // Look up share code
    const shareCode = await this.prisma.profileShareCode.findFirst({
      where: {
        codeHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!shareCode) {
      await this.auditService.record({
        actor: officerUserId,
        institutionId,
        action: 'SHARE_CODE_FAILED',
        entityType: 'ProfileShareCode',
        entityId: 'UNKNOWN',
        metadata: { reason: 'Invalid or expired share code' },
      });
      throw new NotFoundException('Invalid or expired share code');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: shareCode.businessId },
    });
    if (!business) {
      throw new NotFoundException('Business profile not found');
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution || institution.status !== InstitutionStatus.ACTIVE) {
      throw new ForbiddenException('Redeeming institution is not active');
    }

    // Mark code as used
    await this.prisma.profileShareCode.update({
      where: { id: shareCode.id },
      data: {
        usedAt: now,
        redeemedByUserId: officerUserId,
        redeemedByInstitutionId: institutionId,
      },
    });

    // Create AccessRequest for PROFILE (status: APPROVED)
    const request = await this.prisma.accessRequest.create({
      data: {
        businessId: business.id,
        institutionId: institution.id,
        requestedByUserId: officerUserId,
        scopeType: 'PROFILE',
        requestedDocTypes: [],
        purposeCode: 'PROFILE_LOOKUP',
        requestedDurationMinutes: shareCode.consentDurationMinutes,
        allowDownload: false,
        status: 'APPROVED',
        approvalOtpChallengeId: shareCode.otpChallengeId,
        decidedByUserId: business.ownerUserId,
        decidedAt: now,
      },
    });

    // Ledger-first consent creation (D-4, D-11, W2 step 2)
    const consentId = uuidv4();
    const consentExpiry = new Date(now.getTime() + shareCode.consentDurationMinutes * 60 * 1000);
    const approvalEvidenceHash = crypto
      .createHash('sha256')
      .update(`${shareCode.otpChallengeId}:${now.toISOString()}:${business.ownerUserId}:${request.id}`)
      .digest('hex');

    let ledgerTxId = '';
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'CreateConsent',
        consentId,
        business.businessRef,
        institution.mspId,
        'PROFILE',
        '[]',
        'PROFILE_LOOKUP',
        consentExpiry.toISOString(),
        approvalEvidenceHash,
      );
    } catch (err) {
      this.logger.error(`Ledger CreateConsent failed for redeemed share code:`, err);
      throw new BadRequestException(
        `Failed to register PROFILE consent on ledger: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Write database projection
    const consentGrant = await this.prisma.consentGrant.create({
      data: {
        consentId,
        requestId: request.id,
        businessRef: business.businessRef,
        institutionId: institution.id,
        scopeType: 'PROFILE',
        docRefs: [],
        expiresAt: consentExpiry,
        status: 'ACTIVE',
        ledgerTxId,
      },
    });

    // Notify business owner
    await this.notificationsService.notify({
      userId: business.ownerUserId,
      type: 'SHARE_CODE_REDEEMED',
      entityType: 'ConsentGrant',
      entityId: consentGrant.id,
    });

    await this.auditService.record({
      actor: officerUserId,
      institutionId,
      businessId: business.id,
      action: 'SHARE_CODE_REDEEMED',
      entityType: 'ProfileShareCode',
      entityId: shareCode.id,
      ledgerTxId,
      metadata: {
        consentId,
        requestId: request.id,
        scopeType: 'PROFILE',
      },
    });

    // Per W2 step 2: The officer sees only the legal name of the business
    return {
      consentId: consentGrant.consentId,
      business: {
        legalName: business.legalName,
      },
      expiresAt: consentExpiry.toISOString(),
    };
  }
}
