import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UserStatus, InstitutionStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

export interface LoginResult {
  user: AuthenticatedUser;
  sessionId: string;
  csrfToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Authenticate user with argon2id and create a secure server-side session
   */
  async login(
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<LoginResult> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Check account lockout
    if (user?.lockedUntil && user.lockedUntil > now) {
      const minutesRemaining = Math.ceil(
        (user.lockedUntil.getTime() - now.getTime()) / (60 * 1000),
      );
      throw new ForbiddenException(
        `Account is temporarily locked. Try again in ${minutesRemaining} minutes.`,
      );
    }

    // Generic error constant to prevent tenant or email enumeration
    const genericError = new UnauthorizedException('Invalid email or password');

    if (!user) {
      await this.auditService.record({
        actor: dto.email.toLowerCase(),
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: 'unknown',
        metadata: { reason: 'USER_NOT_FOUND', ip },
      });
      throw genericError;
    }

    // Check password with argon2id
    let passwordValid = false;
    try {
      passwordValid = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      passwordValid = false;
    }

    if (!passwordValid) {
      const newFailedCount = user.failedLoginCount + 1;
      let lockedUntil: Date | null = null;

      if (newFailedCount >= 5) {
        lockedUntil = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes lockout
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: newFailedCount,
          lockedUntil,
        },
      });

      await this.auditService.record({
        actor: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        institutionId: user.institutionId,
        businessId: user.businessId,
        metadata: { failedAttempts: newFailedCount, ip },
      });

      if (lockedUntil) {
        await this.auditService.record({
          actor: user.id,
          action: 'AUTH_LOCKOUT',
          entityType: 'User',
          entityId: user.id,
          institutionId: user.institutionId,
          businessId: user.businessId,
          metadata: { lockedUntil: lockedUntil.toISOString(), ip },
        });
        throw new ForbiddenException(
          'Too many failed attempts. Account locked for 15 minutes.',
        );
      }

      throw genericError;
    }

    // Account status check
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is disabled or locked');
    }

    // Check institution status if user belongs to an institution (I-5)
    let instStatus: InstitutionStatus | null = null;
    let instMspId: string | null = null;
    let instName: string | null = null;

    if (user.institutionId) {
      const institution = await this.prisma.institution.findUnique({
        where: { id: user.institutionId },
      });
      if (!institution || institution.status !== InstitutionStatus.ACTIVE) {
        throw new ForbiddenException(
          'INSTITUTION_SUSPENDED: Your institution is not active',
        );
      }
      instStatus = institution.status;
      instMspId = institution.mspId;
      instName = institution.name;
    }

    let businessName: string | null = null;
    if (user.businessId) {
      const business = await this.prisma.business.findUnique({
        where: { id: user.businessId },
        select: { legalName: true },
      });
      businessName = business?.legalName || null;
    }

    // Reset failed login count and record success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });

    // Create session (Idle: 30m, Absolute: 8h)
    const sessionResult = await this.createSession(user.id, ip, userAgent);

    await this.auditService.record({
      actor: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      institutionId: user.institutionId,
      businessId: user.businessId,
      metadata: { ip },
    });

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      institutionId: user.institutionId,
      institutionName: instName,
      institutionStatus: instStatus,
      institutionMspId: instMspId,
      businessId: user.businessId,
      businessName,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      user: authenticatedUser,
      sessionId: sessionResult.sessionId,
      csrfToken: sessionResult.csrfToken,
    };
  }

  /**
   * Helper to create a new server-side session
   */
  private getCsrfSecret(): string {
    return process.env.OTP_PEPPER || process.env.APP_SECRET || 'trustledger-csrf-secret';
  }

  generateCsrfTokenForSession(sessionId: string): string {
    return crypto
      .createHmac('sha256', this.getCsrfSecret())
      .update(sessionId)
      .digest('hex');
  }

  async createSession(
    userId: string,
    ip: string,
    userAgent: string,
  ): Promise<{ sessionId: string; csrfToken: string }> {
    const now = new Date();
    const sessionId = crypto.randomUUID();
    const csrfToken = this.generateCsrfTokenForSession(sessionId);
    const csrfTokenHash = crypto
      .createHash('sha256')
      .update(csrfToken)
      .digest('hex');

    const ipHash = crypto.createHash('sha256').update(ip || '').digest('hex');
    const userAgentHash = crypto
      .createHash('sha256')
      .update(userAgent || '')
      .digest('hex');

    const idleExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
    const absoluteExpiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours

    await this.prisma.serverSession.create({
      data: {
        sessionId,
        userId,
        createdAt: now,
        lastSeenAt: now,
        idleExpiresAt,
        absoluteExpiresAt,
        ipHash,
        userAgentHash,
        csrfTokenHash,
      },
    });

    return { sessionId, csrfToken };
  }

  /**
   * Revoke session on logout
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    await this.prisma.serverSession.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.record({
      actor: userId,
      action: 'AUTH_LOGOUT',
      entityType: 'ServerSession',
      entityId: sessionId,
    });
  }

  /**
   * Return the session's bound CSRF token, auto-healing legacy session hashes if needed
   */
  async getOrCreateCsrfToken(sessionId: string, _clientToken?: string): Promise<string> {
    const session = await this.prisma.serverSession.findUnique({
      where: { sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Session not found or revoked');
    }

    const csrfToken = this.generateCsrfTokenForSession(sessionId);
    const csrfTokenHash = crypto
      .createHash('sha256')
      .update(csrfToken)
      .digest('hex');

    if (session.csrfTokenHash !== csrfTokenHash) {
      await this.prisma.serverSession.update({
        where: { id: session.id },
        data: { csrfTokenHash },
      });
    }

    return csrfToken;
  }

  /**
   * Change password and rotate session
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
    ip: string,
    userAgent: string,
  ): Promise<{ newSessionId: string; newCsrfToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.oldPassword);
    if (!passwordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword.length < 12) {
      throw new BadRequestException('New password must be at least 12 characters');
    }

    const newHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });

    // Revoke previous session
    await this.prisma.serverSession.updateMany({
      where: { sessionId: currentSessionId },
      data: { revokedAt: new Date() },
    });

    // Rotate: Issue new session
    const newSession = await this.createSession(userId, ip, userAgent);

    await this.auditService.record({
      actor: userId,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      institutionId: user.institutionId,
      businessId: user.businessId,
    });

    return {
      newSessionId: newSession.sessionId,
      newCsrfToken: newSession.csrfToken,
    };
  }
}
