import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService, LEDGER_SERVICE } from '../ledger/ledger.interface';

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  async getBusinessConsents(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return this.prisma.consentGrant.findMany({
      where: { businessRef: business.businessRef },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInstitutionConsents(institutionId: string) {
    return this.prisma.consentGrant.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Section 10 W2 step 6: The owner revokes consent
   * Calls RevokeConsent on chain, revokes ConsentGrant and all active AccessSessions
   */
  async revokeConsent(businessId: string, ownerUserId: string, consentId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const consent = await this.prisma.consentGrant.findUnique({
      where: { consentId },
    });
    if (!consent || consent.businessRef !== business.businessRef) {
      throw new NotFoundException('Consent grant not found for this business');
    }

    if (consent.status === 'REVOKED') {
      throw new BadRequestException('Consent is already revoked');
    }

    // 1. Ledger-first revocation call (W2 step 6)
    let ledgerTxId = '';
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'RevokeConsent',
        consentId,
      );
    } catch (err) {
      this.logger.error(`Ledger RevokeConsent failed for ${consentId}:`, err);
      throw new BadRequestException(
        `Failed to revoke consent on ledger: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Update ConsentGrant status in DB
    const updated = await this.prisma.consentGrant.update({
      where: { id: consent.id },
      data: { status: 'REVOKED' },
    });

    // 3. Invalidate/revoke any associated AccessSessions immediately (W2 step 6 & §8.2)
    await this.prisma.accessSession.updateMany({
      where: { consentId, status: { in: ['PENDING_OTP', 'ACTIVE'] } },
      data: { status: 'REVOKED' },
    });

    // 4. Notify institution
    const institution = await this.prisma.institution.findUnique({
      where: { id: consent.institutionId },
    });
    if (institution) {
      // Find compliance officers or admin of the institution to notify
      const officers = await this.prisma.user.findMany({
        where: {
          institutionId: institution.id,
          role: { in: ['KYC_OFFICER', 'COMPLIANCE_OFFICER', 'INSTITUTION_ADMIN'] },
        },
        take: 5,
      });

      for (const officer of officers) {
        await this.notificationsService.notify({
          userId: officer.id,
          type: 'CONSENT_REVOKED',
          entityType: 'ConsentGrant',
          entityId: consent.id,
        });
      }
    }

    // 5. Write audit record (I-6)
    await this.auditService.record({
      actor: ownerUserId,
      businessId,
      institutionId: consent.institutionId,
      action: 'CONSENT_REVOKED',
      entityType: 'ConsentGrant',
      entityId: consent.id,
      ledgerTxId,
      metadata: { consentId },
    });

    return {
      success: true,
      consentId: updated.consentId,
      status: updated.status,
      message: 'Consent revoked successfully on ledger and all sessions terminated',
    };
  }
}
