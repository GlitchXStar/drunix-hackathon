import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InstitutionStatus, UserRole, KycOutcome, AttestationStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LEDGER_SERVICE, LedgerService } from '../ledger/ledger.interface';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateKycReviewDto } from './dto/create-kyc-review.dto';
import { IssueAttestationDto } from './dto/issue-attestation.dto';
import { UpdateAttestationStatusDto } from './dto/update-attestation-status.dto';
import { AttestationLookupResponseDto } from './dto/attestation-lookup-response.dto';

@Injectable()
export class AttestationsService {
  private readonly logger = new Logger(AttestationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Section 10 W3 Step 4: Record a private KYC Review
   * Associated with an active AccessSession and verified documents.
   */
  async createKycReview(officer: AuthenticatedUser, dto: CreateKycReviewDto) {
    // 1. Role and Institution status validation (I-5)
    if (officer.role !== UserRole.KYC_OFFICER) {
      throw new ForbiddenException('Only KYC_OFFICER may record KYC reviews');
    }

    if (!officer.institutionId || officer.institutionStatus !== InstitutionStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Officer must belong to an active institution (I-5)',
      });
    }

    const now = new Date();

    // 2. Fetch and revalidate AccessSession (Stage 6)
    const session = await this.prisma.accessSession.findUnique({
      where: { id: dto.accessSessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `AccessSession ${dto.accessSessionId} not found`,
      });
    }

    // Verify session belongs to officer and institution
    if (session.officerUserId !== officer.id || session.institutionId !== officer.institutionId) {
      throw new ForbiddenException({
        code: 'INSTITUTION_MISMATCH',
        message: 'Cannot record KYC review on a session belonging to another officer or institution',
      });
    }

    // Verify session is ACTIVE and not expired
    if (session.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'SESSION_NOT_ACTIVE',
        message: `AccessSession is ${session.status}, not ACTIVE`,
      });
    }

    if (session.expiresAt <= now) {
      throw new ForbiddenException({
        code: 'SESSION_EXPIRED',
        message: 'AccessSession has expired (S-2)',
      });
    }

    if (session.consentId !== dto.consentId) {
      throw new BadRequestException({
        code: 'CONSENT_MISMATCH',
        message: 'Consent ID in request does not match the active session consent ID',
      });
    }

    // 3. Fetch and revalidate ConsentGrant
    const consent = await this.prisma.consentGrant.findUnique({
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
        code: 'CONSENT_INSTITUTION_MISMATCH',
        message: 'Consent was not granted to your institution',
      });
    }

    if (consent.status === 'REVOKED') {
      throw new ForbiddenException({
        code: 'CONSENT_REVOKED',
        message: 'Consent has been revoked by business owner (S-3)',
      });
    }

    if (consent.status === 'EXPIRED' || consent.expiresAt <= now) {
      throw new ForbiddenException({
        code: 'CONSENT_EXPIRED',
        message: 'Consent has expired',
      });
    }

    // 4. Validate reviewed documents
    // "Ensure a review cannot reference documents that were not actually viewed during the authorized session."
    if (!dto.docRefsReviewed || dto.docRefsReviewed.length === 0) {
      throw new BadRequestException('At least one document reference must be specified for the review');
    }

    const viewedInSession = session.viewedDocRefs || [];
    for (const docRef of dto.docRefsReviewed) {
      if (!viewedInSession.includes(docRef)) {
        throw new BadRequestException({
          code: 'DOC_NOT_VIEWED_IN_SESSION',
          message: `Document ${docRef} was not viewed during AccessSession ${session.id}`,
        });
      }

      if (!consent.docRefs.includes(docRef)) {
        throw new BadRequestException({
          code: 'DOC_NOT_IN_SCOPE',
          message: `Document ${docRef} is not within the approved consent scope`,
        });
      }
    }

    // 5. Fetch associated business
    const business = await this.prisma.business.findUnique({
      where: { businessRef: consent.businessRef },
    });

    if (!business) {
      throw new NotFoundException({
        code: 'BUSINESS_NOT_FOUND',
        message: `Business with businessRef ${consent.businessRef} not found`,
      });
    }

    // 6. Persist KycReview in MongoDB (strictly institution-private, never on-chain)
    const review = await this.prisma.kycReview.create({
      data: {
        businessId: business.id,
        institutionId: officer.institutionId,
        officerUserId: officer.id,
        consentId: consent.consentId,
        accessSessionId: session.id,
        outcome: dto.outcome,
        checklist: JSON.stringify(dto.checklist || {}),
        notes: dto.notes,
        docRefsReviewed: dto.docRefsReviewed,
      },
    });

    // 7. Operational Audit Logging (I-6)
    // Notes and checklist details are internal assessments and redacted from external metadata
    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'KYC_REVIEW_RECORDED',
      entityType: 'KycReview',
      entityId: review.id,
      businessId: business.id,
      metadata: {
        outcome: dto.outcome,
        docRefsReviewed: dto.docRefsReviewed,
        accessSessionId: session.id,
        consentId: consent.consentId,
      },
    });

    return {
      reviewId: review.id,
      outcome: review.outcome,
      docRefsReviewed: review.docRefsReviewed,
      createdAt: review.createdAt.toISOString(),
      message: 'KYC review recorded successfully',
    };
  }

  /**
   * Section 10 W3 Step 5: Issue KYC_BASIC Attestation to Drunix
   * Only eligible VERIFIED reviews can issue an attestation.
   * Builds docHashSnapshot from authoritative hashes of documents viewed in that session.
   */
  async issueAttestation(officer: AuthenticatedUser, dto: IssueAttestationDto) {
    if (officer.role !== UserRole.KYC_OFFICER) {
      throw new ForbiddenException('Only KYC_OFFICER may issue attestations');
    }

    if (!officer.institutionId || officer.institutionStatus !== InstitutionStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Officer must belong to an active institution (I-5)',
      });
    }

    // 1. Fetch KycReview
    const review = await this.prisma.kycReview.findUnique({
      where: { id: dto.kycReviewId },
    });

    if (!review) {
      throw new NotFoundException({
        code: 'REVIEW_NOT_FOUND',
        message: `KycReview ${dto.kycReviewId} not found`,
      });
    }

    if (review.institutionId !== officer.institutionId) {
      throw new ForbiddenException({
        code: 'INSTITUTION_MISMATCH',
        message: 'Cannot issue an attestation for a review performed by another institution',
      });
    }

    // 2. Review outcome gate: must be VERIFIED
    if (review.outcome !== KycOutcome.VERIFIED) {
      throw new BadRequestException({
        code: 'REVIEW_NOT_VERIFIED',
        message: `Attestation can only be issued for VERIFIED reviews (current outcome: ${review.outcome})`,
      });
    }

    // 3. Duplicate check: ensure review has not already resulted in an attestation
    if (review.attestationId) {
      throw new ConflictException({
        code: 'ATTESTATION_ALREADY_ISSUED',
        message: `An attestation (${review.attestationId}) has already been issued for this KYC review`,
      });
    }

    // 4. Fetch business and consent
    const business = await this.prisma.business.findUnique({
      where: { id: review.businessId },
    });

    if (!business) {
      throw new NotFoundException({
        code: 'BUSINESS_NOT_FOUND',
        message: 'Associated business record not found',
      });
    }

    // 5. Construct docHashSnapshot from authoritative hashes of reviewed documents
    if (!review.docRefsReviewed || review.docRefsReviewed.length === 0) {
      throw new BadRequestException('KycReview must include at least one reviewed document reference');
    }

    const documents = await this.prisma.document.findMany({
      where: {
        docRef: { in: review.docRefsReviewed },
        status: { not: 'DELETED' },
      },
    });

    if (documents.length !== review.docRefsReviewed.length) {
      throw new BadRequestException({
        code: 'DOCUMENT_UNAVAILABLE',
        message: 'One or more reviewed documents are missing or marked as DELETED',
      });
    }

    // Extract authoritative contentHash for each viewed document
    const docHashSnapshot = documents.map((d) => d.contentHash);
    for (const hash of docHashSnapshot) {
      if (!hash || hash.length !== 64) {
        throw new BadRequestException({
          code: 'INTEGRITY_MISMATCH',
          message: 'Document contains an invalid cryptographic content hash',
        });
      }
    }

    // 6. Calculate validity period (default 12 months, max 24 months per SPEC §8.5)
    const validityMonths = dto.validityMonths || 12;
    if (validityMonths < 1 || validityMonths > 24) {
      throw new BadRequestException('Attestation validity must be between 1 and 24 months (SPEC §8.5)');
    }

    const now = new Date();
    const validUntil = new Date(now.getTime() + validityMonths * 30 * 24 * 3600 * 1000);
    const attId = uuidv4();
    const attType = dto.type || 'KYC_BASIC';
    const actingMsp = officer.institutionMspId || 'BankAOrgMSP';

    // 7. Ledger-first transaction submission (I-1 fail closed)
    let ledgerTxId: string;
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        actingMsp,
        'IssueAttestation',
        attId,
        business.businessRef,
        attType,
        JSON.stringify(docHashSnapshot),
        validUntil.toISOString(),
      );
    } catch (err) {
      this.logger.error(`Ledger IssueAttestation failed for attestation ${attId}:`, err);
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: `Failed to issue attestation on ledger (I-1 fail closed): ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 8. Persist Attestation projection in database
    const attestation = await this.prisma.attestation.create({
      data: {
        attId,
        businessRef: business.businessRef,
        issuerInstId: actingMsp,
        type: attType,
        status: AttestationStatus.VALID,
        validUntil,
        docHashSnapshot,
        ledgerTxId,
      },
    });

    // 9. Update KycReview with attestationId
    await this.prisma.kycReview.update({
      where: { id: review.id },
      data: { attestationId: attestation.attId },
    });

    // 10. Audit event (I-6)
    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'ATTESTATION_ISSUED',
      entityType: 'Attestation',
      entityId: attId,
      businessId: business.id,
      ledgerTxId,
      metadata: {
        type: attType,
        validUntil: validUntil.toISOString(),
        docHashSnapshotCount: docHashSnapshot.length,
        kycReviewId: review.id,
      },
    });

    // 11. Notify business owner (SPEC §14.2)
    await this.notificationsService.notify({
      userId: business.ownerUserId,
      type: 'ATTESTATION_ISSUED',
      entityType: 'Attestation',
      entityId: attId,
    });

    return {
      attId: attestation.attId,
      businessRef: business.businessRef,
      type: attestation.type,
      status: attestation.status,
      issuedAt: now.toISOString(),
      validUntil: validUntil.toISOString(),
      docHashSnapshotCount: docHashSnapshot.length,
      ledgerTxId,
      message: 'Attestation issued successfully on Drunix',
    };
  }

  /**
   * Section 10 W3 Step 6 & D-9: Suspend or Revoke own attestation
   * Lifecycle: VALID -> SUSPENDED | REVOKED; SUSPENDED -> REVOKED.
   * Reinstatement (SUSPENDED -> VALID) is strictly prohibited.
   */
  async updateAttestationStatus(
    officer: AuthenticatedUser,
    attId: string,
    dto: UpdateAttestationStatusDto,
  ) {
    if (officer.role !== UserRole.KYC_OFFICER) {
      throw new ForbiddenException('Only KYC_OFFICER may suspend or revoke attestations');
    }

    if (!officer.institutionId || officer.institutionStatus !== InstitutionStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Officer must belong to an active institution (I-5)',
      });
    }

    // 1. Fetch Attestation projection
    const attestation = await this.prisma.attestation.findUnique({
      where: { attId },
    });

    if (!attestation) {
      throw new NotFoundException({
        code: 'ATTESTATION_NOT_FOUND',
        message: `Attestation ${attId} not found`,
      });
    }

    // 2. Verify issuer authority: caller MSP must match issuer
    const actingMsp = officer.institutionMspId || 'BankAOrgMSP';
    if (
      attestation.issuerInstId !== actingMsp &&
      attestation.issuerInstId !== officer.institutionId
    ) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_ISSUER',
        message: `Only the issuing institution (${attestation.issuerInstId}) may update attestation status`,
      });
    }

    // 3. Enforce lifecycle invariants (D-9)
    if (attestation.status === AttestationStatus.REVOKED) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Attestation ${attId} is already REVOKED (terminal state, D-9)`,
      });
    }

    if (attestation.status === AttestationStatus.SUSPENDED && dto.status === 'SUSPENDED') {
      throw new BadRequestException(`Attestation ${attId} is already SUSPENDED`);
    }

    const now = new Date();
    if (attestation.validUntil <= now) {
      throw new BadRequestException({
        code: 'ATTESTATION_EXPIRED',
        message: `Cannot update status of expired attestation ${attId}`,
      });
    }

    // 4. Update status on Drunix ledger (I-1 fail closed)
    let ledgerTxId: string;
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        actingMsp,
        'UpdateAttestationStatus',
        attId,
        dto.status,
        dto.reasonCode,
      );
    } catch (err) {
      this.logger.error(`Ledger UpdateAttestationStatus failed for ${attId}:`, err);
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: `Failed to update attestation status on ledger (I-1 fail closed): ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 5. Update local database projection
    const updated = await this.prisma.attestation.update({
      where: { attId },
      data: {
        status: dto.status as AttestationStatus,
        ledgerTxId,
      },
    });

    // 6. Audit logging (I-6)
    await this.auditService.record({
      actor: officer.id,
      institutionId: officer.institutionId,
      action: 'ATTESTATION_STATUS_CHANGED',
      entityType: 'Attestation',
      entityId: attId,
      ledgerTxId,
      metadata: {
        previousStatus: attestation.status,
        newStatus: dto.status,
        reasonCode: dto.reasonCode,
      },
    });

    // 7. Notify business owner
    const business = await this.prisma.business.findUnique({
      where: { businessRef: attestation.businessRef },
    });
    if (business) {
      await this.notificationsService.notify({
        userId: business.ownerUserId,
        type: 'ATTESTATION_STATUS_CHANGED',
        entityType: 'Attestation',
        entityId: attId,
      });
    }

    return {
      attId: updated.attId,
      status: updated.status,
      reasonCode: dto.reasonCode,
      updatedAt: new Date().toISOString(),
      message: `Attestation status successfully updated to ${dto.status} on Drunix`,
    };
  }

  /**
   * Section 10 W5: Cross-institution attestation lookup
   * An NBFC (or second institution) queries attestations using an active PROFILE consent.
   * Responses are strictly filtered (zero KYC notes, checklist, or internal assessments leaked).
   * Computes dynamic EXPIRED status and documentsUnchangedSinceAttestation.
   */
  async lookupAttestations(
    requester: AuthenticatedUser,
    consentId: string,
  ): Promise<AttestationLookupResponseDto[]> {
    // 1. Role verification: KYC_OFFICER, COMPLIANCE_OFFICER, or LOAN_OFFICER
    const allowedRoles: UserRole[] = [
      UserRole.KYC_OFFICER,
      UserRole.COMPLIANCE_OFFICER,
      UserRole.LOAN_OFFICER,
    ];
    if (!allowedRoles.includes(requester.role)) {
      throw new ForbiddenException('Only KYC, Compliance, or Loan officers may look up attestations');
    }

    if (!requester.institutionId || requester.institutionStatus !== InstitutionStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'INSTITUTION_SUSPENDED',
        message: 'Requesting institution is not active (I-5)',
      });
    }

    const now = new Date();

    // 2. Fetch ConsentGrant
    const consent = await this.prisma.consentGrant.findUnique({
      where: { consentId },
    });

    if (!consent) {
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: 'CONSENT_NOT_FOUND' },
      });
      throw new NotFoundException({
        code: 'CONSENT_NOT_FOUND',
        message: 'Consent grant not found',
      });
    }

    // Verify consent belongs to caller's institution
    if (consent.institutionId !== requester.institutionId) {
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: 'CONSENT_INSTITUTION_MISMATCH' },
      });
      throw new ForbiddenException({
        code: 'CONSENT_INSTITUTION_MISMATCH',
        message: 'Consent was not granted to your institution',
      });
    }

    // Verify scope is PROFILE
    if (consent.scopeType !== 'PROFILE') {
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: 'SCOPE_MISMATCH' },
      });
      throw new ForbiddenException({
        code: 'SCOPE_MISMATCH',
        message: `Attestation lookup requires a PROFILE consent grant (found ${consent.scopeType})`,
      });
    }

    // Verify consent not revoked or expired
    if (consent.status === 'REVOKED') {
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: 'CONSENT_REVOKED' },
      });
      throw new ForbiddenException({
        code: 'CONSENT_REVOKED',
        message: 'Consent has been revoked by business owner',
      });
    }

    if (consent.status === 'EXPIRED' || consent.expiresAt <= now) {
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: 'CONSENT_EXPIRED' },
      });
      throw new ForbiddenException({
        code: 'CONSENT_EXPIRED',
        message: 'Consent has expired',
      });
    }

    // 3. Ledger-first access authorization check (I-1 fail closed)
    const actingMsp = requester.institutionMspId || 'NbfcOrgMSP';
    let checkResult;
    try {
      checkResult = await this.ledgerService.checkAccess(
        consentId,
        actingMsp,
        'PROFILE',
      );
    } catch (err) {
      this.logger.error(`Ledger checkAccess failed for consent ${consentId}:`, err);
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: 'LEDGER_UNAVAILABLE' },
      });
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: 'Ledger unreachable during attestation lookup authorization (I-1 fail closed)',
      });
    }

    if (!checkResult || !checkResult.allowed) {
      const code = checkResult?.reasonCode || 'ACCESS_DENIED';
      await this.auditService.record({
        actor: requester.id,
        institutionId: requester.institutionId,
        action: 'ACCESS_DENIED',
        entityType: 'Attestation',
        entityId: consentId,
        metadata: { reasonCode: code },
      });
      throw new ForbiddenException({
        code,
        message: `Ledger access denied: ${code}`,
      });
    }

    // 4. Query authoritative attestations from Drunix ledger
    let rawAttestationsJson: string;
    try {
      rawAttestationsJson = await this.ledgerService.evaluateTransaction(
        actingMsp,
        'GetAttestations',
        consent.businessRef,
        consentId,
      );
    } catch (err) {
      this.logger.error(`Ledger GetAttestations failed for ${consent.businessRef}:`, err);
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: 'Failed to retrieve attestations from ledger (I-1 fail closed)',
      });
    }

    let onChainAttestations: any[] = [];
    if (rawAttestationsJson && rawAttestationsJson.trim() !== '') {
      try {
        onChainAttestations = JSON.parse(rawAttestationsJson);
      } catch {
        onChainAttestations = [];
      }
    }

    // 5. Fetch current authoritative documents for this businessRef
    // Used to evaluate documentsUnchangedSinceAttestation
    const business = await this.prisma.business.findUnique({
      where: { businessRef: consent.businessRef },
    });

    const currentDocuments = business
      ? await this.prisma.document.findMany({
          where: {
            businessId: business.id,
            status: { not: 'DELETED' },
          },
        })
      : [];

    const currentActiveHashes = new Set<string>(
      currentDocuments.map((doc) => doc.contentHash),
    );

    // 6. Build strictly filtered response items (Section 7, Section 8, W5)
    const results: AttestationLookupResponseDto[] = [];

    for (const att of onChainAttestations) {
      const valTime = new Date(att.validUntil);
      let effectiveStatus: 'VALID' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED' = att.status;

      // Compute dynamic expiration
      if (att.status === 'VALID' && valTime <= now) {
        effectiveStatus = 'EXPIRED';
      }

      // Compute document integrity: documentsUnchangedSinceAttestation
      // True ONLY if the attestation is VALID and every snapshot hash still matches
      // a currently active, non-replaced, registered document for that business
      let documentsUnchangedSinceAttestation = false;
      const snapshots: string[] = att.docHashSnapshot || [];

      if (effectiveStatus === 'VALID' && snapshots.length > 0 && currentActiveHashes.size > 0) {
        const allMatch = snapshots.every((snapHash) => currentActiveHashes.has(snapHash));
        documentsUnchangedSinceAttestation = allMatch;
      }

      // Fetch issuer institution name & type
      const issuer = await this.prisma.institution.findFirst({
        where: {
          OR: [
            { mspId: att.issuerInstId },
            { id: att.issuerInstId },
          ],
        },
      });

      results.push({
        attId: att.attId,
        businessRef: consent.businessRef,
        issuerInstitution: {
          id: issuer?.id || att.issuerInstId,
          name: issuer?.name || 'Authorized Financial Institution',
          type: issuer?.type || 'BANK',
          mspId: issuer?.mspId || att.issuerInstId,
        },
        type: att.type || 'KYC_BASIC',
        status: effectiveStatus,
        issuedAt: att.issuedAt,
        validUntil: att.validUntil,
        documentsUnchangedSinceAttestation,
      });
    }

    // 7. Audit log (I-6)
    await this.auditService.record({
      actor: requester.id,
      institutionId: requester.institutionId,
      action: 'ATTESTATION_LOOKUP',
      entityType: 'Attestation',
      entityId: consent.businessRef,
      metadata: {
        consentId,
        attestationsFound: results.length,
      },
    });

    return results;
  }

  /**
   * MSME Owner: View all attestations issued for their own business
   */
  async getBusinessAttestations(user: AuthenticatedUser) {
    if (user.role !== UserRole.BUSINESS_OWNER) {
      throw new ForbiddenException('Only business owners may view business attestations');
    }

    if (!user.businessId) {
      throw new NotFoundException('No business associated with this user');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
    });

    if (!business) {
      throw new NotFoundException('Business profile not found');
    }

    const attestations = await this.prisma.attestation.findMany({
      where: { businessRef: business.businessRef },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return attestations.map((att) => {
      let status = att.status;
      if (att.status === AttestationStatus.VALID && att.validUntil <= now) {
        status = 'EXPIRED' as any;
      }

      return {
        attId: att.attId,
        businessRef: att.businessRef,
        type: att.type,
        status,
        issuedAt: att.createdAt.toISOString(),
        validUntil: att.validUntil.toISOString(),
        docHashSnapshotCount: att.docHashSnapshot.length,
      };
    });
  }
}
