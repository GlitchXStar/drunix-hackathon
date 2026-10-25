import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SessionSweeperService {
  private readonly logger = new Logger(SessionSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Sweeps expired AccessSessions (status PENDING_OTP or ACTIVE with expiresAt < now)
   */
  async sweepExpiredSessions(batchSize = 100): Promise<number> {
    const now = new Date();

    const expiredSessions = await this.prisma.accessSession.findMany({
      where: {
        status: { in: ['PENDING_OTP', 'ACTIVE'] },
        expiresAt: { lt: now },
      },
      take: batchSize,
    });

    if (expiredSessions.length === 0) {
      return 0;
    }

    const ids = expiredSessions.map((s) => s.id);
    const updated = await this.prisma.accessSession.updateMany({
      where: {
        id: { in: ids },
        status: { in: ['PENDING_OTP', 'ACTIVE'] },
      },
      data: { status: 'EXPIRED' },
    });

    for (const session of expiredSessions) {
      await this.auditService.record({
        actor: 'SYSTEM_SWEEPER',
        institutionId: session.institutionId,
        action: 'SESSION_EXPIRED',
        entityType: 'AccessSession',
        entityId: session.id,
        metadata: {
          consentId: session.consentId,
          expiredAt: now.toISOString(),
        },
      });
    }

    this.logger.log(`Swept and marked ${updated.count} expired AccessSessions`);
    return updated.count;
  }

  /**
   * Immediately invalidates and revokes all active sessions tied to a revoked consent
   */
  async revokeSessionsForConsent(consentId: string): Promise<number> {
    const sessions = await this.prisma.accessSession.findMany({
      where: {
        consentId,
        status: { in: ['PENDING_OTP', 'ACTIVE'] },
      },
    });

    if (sessions.length === 0) return 0;

    const ids = sessions.map((s) => s.id);
    const updated = await this.prisma.accessSession.updateMany({
      where: {
        id: { in: ids },
        status: { in: ['PENDING_OTP', 'ACTIVE'] },
      },
      data: { status: 'REVOKED' },
    });

    for (const s of sessions) {
      await this.auditService.record({
        actor: 'SYSTEM_SWEEPER',
        institutionId: s.institutionId,
        action: 'SESSION_REVOKED',
        entityType: 'AccessSession',
        entityId: s.id,
        metadata: { consentId, reason: 'Consent revoked by business' },
      });
    }

    return updated.count;
  }

  /**
   * Immediately invalidates and revokes all active sessions for a suspended institution
   */
  async revokeSessionsForInstitution(institutionId: string): Promise<number> {
    const sessions = await this.prisma.accessSession.findMany({
      where: {
        institutionId,
        status: { in: ['PENDING_OTP', 'ACTIVE'] },
      },
    });

    if (sessions.length === 0) return 0;

    const ids = sessions.map((s) => s.id);
    const updated = await this.prisma.accessSession.updateMany({
      where: {
        id: { in: ids },
        status: { in: ['PENDING_OTP', 'ACTIVE'] },
      },
      data: { status: 'REVOKED' },
    });

    for (const s of sessions) {
      await this.auditService.record({
        actor: 'SYSTEM_SWEEPER',
        institutionId,
        action: 'SESSION_REVOKED',
        entityType: 'AccessSession',
        entityId: s.id,
        metadata: { institutionId, reason: 'Institution suspended' },
      });
    }

    return updated.count;
  }
}
