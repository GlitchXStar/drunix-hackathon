import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { OTP_DELIVERY_PROVIDER, OtpDeliveryProvider } from './otp.interface';

export interface CreateOtpParams {
  purpose: OtpPurpose;
  subjectUserId: string;
  boundEntityId: string;
  recipientContact: string;
}

export interface VerifyOtpParams {
  challengeId: string;
  purpose: OtpPurpose;
  subjectUserId: string;
  boundEntityId: string;
  code: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @Inject(OTP_DELIVERY_PROVIDER)
    private readonly deliveryProvider: OtpDeliveryProvider,
  ) {
    this.pepper = this.configService.get<string>('OTP_PEPPER') || 'trustledger-default-otp-secret-pepper-2026';
  }

  /**
   * Compute HMAC-SHA256 of the OTP code bound to challengeId and pepper
   */
  public computeHash(challengeId: string, code: string): string {
    return crypto
      .createHmac('sha256', this.pepper)
      .update(`${challengeId}:${code}`)
      .digest('hex');
  }

  /**
   * Issue a new OTP challenge
   */
  async createChallenge(params: CreateOtpParams): Promise<{ challengeId: string }> {
    const now = new Date();

    // 1. Resend rate limits: 1 per 30 seconds, 3 per 10 minutes
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const recentChallenges = await this.prisma.otpChallenge.findMany({
      where: {
        subjectUserId: params.subjectUserId,
        boundEntityId: params.boundEntityId,
        purpose: params.purpose,
        createdAt: { gte: tenMinutesAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenges.length > 0) {
      const latest = recentChallenges[0];
      const secondsSinceLatest = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (secondsSinceLatest < 30) {
        throw new BadRequestException('Please wait 30 seconds before requesting a new OTP');
      }
      if (recentChallenges.length >= 3) {
        throw new BadRequestException('Maximum 3 OTP requests allowed per 10 minutes');
      }
    }

    // 2. Invalidate any earlier active challenges for the same purpose & bound entity
    await this.prisma.otpChallenge.updateMany({
      where: {
        subjectUserId: params.subjectUserId,
        boundEntityId: params.boundEntityId,
        purpose: params.purpose,
        consumedAt: null,
      },
      data: {
        consumedAt: now, // Invalidate
      },
    });

    // 3. Generate 6-digit CSPRNG code
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const tempChallengeId = crypto.randomUUID();
    const codeHash = this.computeHash(tempChallengeId, rawCode);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        id: tempChallengeId,
        purpose: params.purpose,
        subjectUserId: params.subjectUserId,
        boundEntityId: params.boundEntityId,
        codeHash,
        attempts: 0,
        expiresAt,
        createdAt: now,
      },
    });

    // 4. Deliver through provider
    await this.deliveryProvider.deliver({
      to: params.recipientContact,
      purpose: params.purpose,
      code: rawCode,
      challengeId: challenge.id,
    });

    // 5. Audit creation (without OTP value)
    await this.auditService.record({
      actor: params.subjectUserId,
      action: 'OTP_ISSUED',
      entityType: 'OtpChallenge',
      entityId: challenge.id,
      metadata: {
        purpose: params.purpose,
        boundEntityId: params.boundEntityId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return { challengeId: challenge.id };
  }

  /**
   * Verify an OTP challenge
   */
  async verifyOtp(params: VerifyOtpParams): Promise<boolean> {
    const now = new Date();
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: params.challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('OTP challenge not found');
    }

    // Purpose and entity binding check
    if (
      challenge.purpose !== params.purpose ||
      challenge.subjectUserId !== params.subjectUserId ||
      challenge.boundEntityId !== params.boundEntityId
    ) {
      await this.auditService.record({
        actor: params.subjectUserId,
        action: 'OTP_FAILED',
        entityType: 'OtpChallenge',
        entityId: params.challengeId,
        metadata: { reason: 'BINDING_MISMATCH' },
      });
      throw new ForbiddenException('OTP challenge binding mismatch');
    }

    // Single use check
    if (challenge.consumedAt) {
      await this.auditService.record({
        actor: params.subjectUserId,
        action: 'OTP_FAILED',
        entityType: 'OtpChallenge',
        entityId: params.challengeId,
        metadata: { reason: 'ALREADY_CONSUMED' },
      });
      throw new BadRequestException('OTP has already been used');
    }

    // Expiry check
    if (now > challenge.expiresAt) {
      await this.auditService.record({
        actor: params.subjectUserId,
        action: 'OTP_FAILED',
        entityType: 'OtpChallenge',
        entityId: params.challengeId,
        metadata: { reason: 'EXPIRED' },
      });
      throw new BadRequestException('OTP has expired');
    }

    // Maximum 5 attempts check
    if (challenge.attempts >= 5) {
      await this.auditService.record({
        actor: params.subjectUserId,
        action: 'OTP_FAILED',
        entityType: 'OtpChallenge',
        entityId: params.challengeId,
        metadata: { reason: 'EXCEEDED_ATTEMPTS' },
      });
      throw new ForbiddenException('Maximum OTP verification attempts exceeded');
    }

    // Constant-time HMAC comparison
    const expectedHash = this.computeHash(challenge.id, params.code);
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(challenge.codeHash, 'hex');

    const isMatch =
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer);

    if (!isMatch) {
      const updatedAttempts = challenge.attempts + 1;
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: updatedAttempts },
      });

      await this.auditService.record({
        actor: params.subjectUserId,
        action: 'OTP_FAILED',
        entityType: 'OtpChallenge',
        entityId: params.challengeId,
        metadata: { attemptsRemaining: Math.max(0, 5 - updatedAttempts) },
      });

      throw new BadRequestException(`Invalid OTP code. ${Math.max(0, 5 - updatedAttempts)} attempts remaining.`);
    }

    // Success: mark consumed
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    });

    await this.auditService.record({
      actor: params.subjectUserId,
      action: 'OTP_VERIFIED',
      entityType: 'OtpChallenge',
      entityId: params.challengeId,
      metadata: { purpose: params.purpose },
    });

    return true;
  }
}
