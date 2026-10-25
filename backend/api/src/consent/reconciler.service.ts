import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService, LEDGER_SERVICE } from '../ledger/ledger.interface';

@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Sweeps unanswered PENDING access requests older than 7 days (SPEC 10 W2 step 7)
   */
  async sweepExpiredRequests(): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const expiredRequests = await this.prisma.accessRequest.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: sevenDaysAgo },
      },
    });

    for (const req of expiredRequests) {
      await this.prisma.accessRequest.update({
        where: { id: req.id },
        data: { status: 'EXPIRED' },
      });

      await this.auditService.record({
        actor: 'SYSTEM_RECONCILER',
        businessId: req.businessId,
        institutionId: req.institutionId,
        action: 'REQUEST_EXPIRED',
        entityType: 'AccessRequest',
        entityId: req.id,
        metadata: { reason: '7-day inactivity expiration' },
      });
    }

    return expiredRequests.length;
  }

  /**
   * Sweeps expired ConsentGrants and sets status to EXPIRED
   */
  async sweepExpiredConsents(): Promise<number> {
    const now = new Date();
    const expiredGrants = await this.prisma.consentGrant.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
    });

    for (const grant of expiredGrants) {
      await this.prisma.consentGrant.update({
        where: { id: grant.id },
        data: { status: 'EXPIRED' },
      });

      await this.prisma.accessSession.updateMany({
        where: { consentId: grant.consentId, status: { in: ['PENDING_OTP', 'ACTIVE'] } },
        data: { status: 'EXPIRED' },
      });
    }

    return expiredGrants.length;
  }

  /**
   * Rebuilds missing ConsentGrant database projection from on-chain commit (I-2)
   */
  async rebuildProjectionFromLedger(
    consentId: string,
    businessRef: string,
    institutionId: string,
    scopeType: string,
    docRefs: string[],
    expiresAt: Date,
    ledgerTxId?: string,
  ) {
    const existing = await this.prisma.consentGrant.findUnique({
      where: { consentId },
    });

    if (!existing) {
      this.logger.log(`Reconciler rebuilding missing database projection for consent ${consentId} (I-2)`);
      return this.prisma.consentGrant.create({
        data: {
          consentId,
          businessRef,
          institutionId,
          scopeType,
          docRefs,
          expiresAt,
          status: 'ACTIVE',
          ledgerTxId: ledgerTxId || null,
        },
      });
    }

    return existing;
  }

  /**
   * Synchronizes database projection with ledger status when state disagrees (I-2: Ledger wins)
   */
  async reconcileConsentStatus(
    consentId: string,
    institutionId: string,
    scopeType: string,
  ): Promise<string> {
    const grant = await this.prisma.consentGrant.findUnique({
      where: { consentId },
    });
    if (!grant) return 'NOT_FOUND';

    const check = await this.ledgerService.checkAccess(consentId, institutionId, scopeType);
    if (check.reasonCode === 'CONSENT_REVOKED' && grant.status !== 'REVOKED') {
      this.logger.warn(`Reconciler reconciling REVOKED status from ledger for consent ${consentId} (I-2)`);
      await this.prisma.consentGrant.update({
        where: { id: grant.id },
        data: { status: 'REVOKED' },
      });
      await this.prisma.accessSession.updateMany({
        where: { consentId, status: { in: ['PENDING_OTP', 'ACTIVE'] } },
        data: { status: 'REVOKED' },
      });
      return 'REVOKED';
    }
    if (check.reasonCode === 'CONSENT_EXPIRED' && grant.status !== 'EXPIRED') {
      this.logger.warn(`Reconciler reconciling EXPIRED status from ledger for consent ${consentId} (I-2)`);
      await this.prisma.consentGrant.update({
        where: { id: grant.id },
        data: { status: 'EXPIRED' },
      });
      await this.prisma.accessSession.updateMany({
        where: { consentId, status: { in: ['PENDING_OTP', 'ACTIVE'] } },
        data: { status: 'EXPIRED' },
      });
      return 'EXPIRED';
    }
    return grant.status;
  }
}
