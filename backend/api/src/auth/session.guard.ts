import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus, InstitutionStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthenticatedUser, SessionContext } from '../common/interfaces/authenticated-user.interface';

export const SESSION_COOKIE_NAME = 'trustledger_session';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionId) {
      throw new UnauthorizedException('Authentication session required');
    }

    const now = new Date();

    // 1. Fetch active session
    const session = await this.prisma.serverSession.findUnique({
      where: { sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // 2. Idle timeout check (30 minutes)
    if (now > session.idleExpiresAt) {
      await this.prisma.serverSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Session idle timeout exceeded');
    }

    // 3. Absolute lifetime check (8 hours)
    if (now > session.absoluteExpiresAt) {
      await this.prisma.serverSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Session absolute lifetime exceeded');
    }

    // 4. Fetch user and re-validate active statuses on every request (I-5)
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    let instStatus: InstitutionStatus | null = null;
    let instMspId: string | null = null;

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
    }

    // 5. CSRF Token Validation for state-changing requests (§8.2, S-11)
    const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (stateChangingMethods.includes(request.method.toUpperCase())) {
      const csrfHeader = request.headers['x-csrf-token'];
      if (!csrfHeader || typeof csrfHeader !== 'string') {
        throw new ForbiddenException('CSRF token missing or invalid');
      }

      const clientCsrfHash = crypto
        .createHash('sha256')
        .update(csrfHeader)
        .digest('hex');

      const expectedBuf = Buffer.from(session.csrfTokenHash, 'hex');
      const actualBuf = Buffer.from(clientCsrfHash, 'hex');

      const csrfValid =
        expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);

      if (!csrfValid) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    }

    // 6. Sliding idle expiration (30 minutes from now)
    const newIdleExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    await this.prisma.serverSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        idleExpiresAt: newIdleExpiresAt,
      },
    });

    // 7. Inject authenticated context into request
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      institutionId: user.institutionId,
      institutionStatus: instStatus,
      institutionMspId: instMspId,
      businessId: user.businessId,
      mustChangePassword: user.mustChangePassword,
    };

    const sessionContext: SessionContext = {
      sessionId: session.sessionId,
      userId: session.userId,
      idleExpiresAt: newIdleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      csrfTokenHash: session.csrfTokenHash,
    };

    request.user = authenticatedUser;
    request.session = sessionContext;

    return true;
  }
}
