import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OtpPurpose, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { OtpService } from '../otp/otp.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService, LEDGER_SERVICE } from '../ledger/ledger.interface';
import { CreateRequestDto } from './dto/create-request.dto';
import { DecideRequestDto } from './dto/decide-request.dto';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Institution creates a DOCUMENTS or FEATURES request (W2 step 3)
   * Requires an active PROFILE consent for this business and institution
   */
  async createRequest(
    institutionId: string,
    officerUserId: string,
    dto: CreateRequestDto,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });
    if (!business) {
      throw new NotFoundException('Business profile not found');
    }

    // Verify active PROFILE consent exists (W2 step 3)
    const now = new Date();
    const profileConsent = await this.prisma.consentGrant.findFirst({
      where: {
        businessRef: business.businessRef,
        institutionId,
        scopeType: 'PROFILE',
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
    });

    if (!profileConsent) {
      throw new ForbiddenException({
        code: 'PROFILE_CONSENT_REQUIRED',
        message: 'An active PROFILE consent is required to request documents or features (W2 step 3)',
      });
    }

    const officer = await this.prisma.user.findUnique({
      where: { id: officerUserId },
    });
    if (!officer) {
      throw new NotFoundException('Officer not found');
    }
    if (dto.scopeType === 'DOCUMENTS' && officer.role !== 'KYC_OFFICER') {
      throw new ForbiddenException('Only KYC_OFFICER can request DOCUMENTS scope');
    }
    if (dto.scopeType === 'FEATURES' && officer.role !== 'LOAN_OFFICER') {
      throw new ForbiddenException('Only LOAN_OFFICER can request FEATURES scope');
    }

    const duration = Math.min(Math.max(dto.requestedDurationMinutes || 43200, 1), 43200);

    const request = await this.prisma.accessRequest.create({
      data: {
        businessId: business.id,
        institutionId,
        requestedByUserId: officerUserId,
        scopeType: dto.scopeType,
        requestedDocTypes: dto.requestedDocTypes || [],
        purposeCode: dto.purposeCode,
        requestedDurationMinutes: duration,
        allowDownload: dto.allowDownload || false,
        message: dto.message || null,
        status: 'PENDING',
      },
    });

    // Notify business owner
    await this.notificationsService.notify({
      userId: business.ownerUserId,
      type: 'REQUEST_RECEIVED',
      entityType: 'AccessRequest',
      entityId: request.id,
    });

    await this.auditService.record({
      actor: officerUserId,
      institutionId,
      businessId: business.id,
      action: 'REQUEST_CREATED',
      entityType: 'AccessRequest',
      entityId: request.id,
      metadata: {
        scopeType: dto.scopeType,
        requestedDocTypes: dto.requestedDocTypes,
        purposeCode: dto.purposeCode,
      },
    });

    return request;
  }

  /**
   * Institution officer cancels a PENDING request (W2 step 7)
   */
  async cancelRequest(institutionId: string, officerUserId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, institutionId },
    });
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING requests can be cancelled');
    }

    const updated = await this.prisma.accessRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED' },
    });

    await this.auditService.record({
      actor: officerUserId,
      institutionId,
      businessId: request.businessId,
      action: 'REQUEST_CANCELLED',
      entityType: 'AccessRequest',
      entityId: request.id,
    });

    return updated;
  }

  /**
   * Business owner requests approval OTP challenge bound to requestId (W2 step 4)
   */
  async issueApprovalOtp(businessId: string, ownerUserId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, businessId },
    });
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Cannot issue approval OTP for request in ${request.status} state`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
    });
    const recipientContact = user?.phone || user?.email || 'owner@example.com';

    const challenge = await this.otpService.createChallenge({
      purpose: OtpPurpose.CUSTOMER_APPROVAL,
      subjectUserId: ownerUserId,
      boundEntityId: request.id,
      recipientContact,
    });

    await this.prisma.accessRequest.update({
      where: { id: request.id },
      data: { approvalOtpChallengeId: challenge.challengeId },
    });

    await this.auditService.record({
      actor: ownerUserId,
      action: 'OTP_ISSUED',
      entityType: 'AccessRequest',
      entityId: request.id,
      businessId,
      metadata: { purpose: 'CUSTOMER_APPROVAL', boundEntityId: request.id },
    });

    return {
      challengeId: challenge.challengeId,
      message: 'Approval OTP issued to business owner',
    };
  }

  /**
   * Business owner decides request (APPROVE or REJECT) with OTP & per-document selection (W2 step 5)
   */
  async decideRequest(
    businessId: string,
    ownerUserId: string,
    requestId: string,
    dto: DecideRequestDto,
  ) {
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, businessId },
    });
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Cannot decide request in ${request.status} status`);
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business profile not found');
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: request.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Requesting institution not found');
    }

    const now = new Date();

    // 1. REJECT outcome
    if (dto.decision === 'REJECT') {
      const updated = await this.prisma.accessRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          decidedAt: now,
          decidedByUserId: ownerUserId,
        },
      });

      await this.notificationsService.notify({
        userId: request.requestedByUserId,
        type: 'REQUEST_DECIDED',
        entityType: 'AccessRequest',
        entityId: request.id,
      });

      await this.auditService.record({
        actor: ownerUserId,
        businessId,
        institutionId: request.institutionId,
        action: 'REQUEST_REJECTED',
        entityType: 'AccessRequest',
        entityId: request.id,
      });

      return updated;
    }

    // 2. APPROVE outcome
    if (!dto.otpCode) {
      throw new BadRequestException('otpCode is required to approve access request');
    }

    if (!request.approvalOtpChallengeId) {
      throw new BadRequestException('No active OTP challenge for this request. Please request OTP first.');
    }

    // Verify OTP bound to requestId
    await this.otpService.verifyOtp({
      challengeId: request.approvalOtpChallengeId,
      code: dto.otpCode,
      purpose: OtpPurpose.CUSTOMER_APPROVAL,
      subjectUserId: ownerUserId,
      boundEntityId: request.id,
    });

    // If owner approved nothing, request becomes REJECTED (W2 step 5)
    const approvedDocs = dto.approvedDocRefs || [];
    if (request.scopeType === 'DOCUMENTS' && approvedDocs.length === 0) {
      const rejected = await this.prisma.accessRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          decidedAt: now,
          decidedByUserId: ownerUserId,
        },
      });

      await this.notificationsService.notify({
        userId: request.requestedByUserId,
        type: 'REQUEST_DECIDED',
        entityType: 'AccessRequest',
        entityId: request.id,
      });

      await this.auditService.record({
        actor: ownerUserId,
        businessId,
        institutionId: request.institutionId,
        action: 'REQUEST_REJECTED',
        entityType: 'AccessRequest',
        entityId: request.id,
        metadata: { reason: 'No documents approved by owner' },
      });

      return {
        ...rejected,
        message: 'No documents were selected; request marked as REJECTED (W2 step 5)',
      };
    }

    // Determine final status: PARTIALLY_APPROVED or APPROVED
    let finalStatus: RequestStatus = 'APPROVED';
    if (request.scopeType === 'DOCUMENTS' && approvedDocs.length < request.requestedDocTypes.length) {
      finalStatus = 'PARTIALLY_APPROVED';
    }

    const durationMinutes = Math.min(
      Math.max(dto.durationMinutes || request.requestedDurationMinutes, 1),
      43200,
    );
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    // Ledger-first consent write (W2 step 5, I-1, I-2)
    const consentId = uuidv4();
    const challengeId = request.approvalOtpChallengeId || 'otp-ch-direct';
    const approvalEvidenceHash = crypto
      .createHash('sha256')
      .update(`${challengeId}:${now.toISOString()}:${ownerUserId}:${request.id}`)
      .digest('hex');

    let ledgerTxId = '';
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'CreateConsent',
        consentId,
        business.businessRef,
        institution.mspId,
        request.scopeType,
        JSON.stringify(approvedDocs),
        request.purposeCode,
        expiresAt.toISOString(),
        approvalEvidenceHash,
      );
    } catch (err) {
      this.logger.error(`Ledger CreateConsent failed for request ${request.id}:`, err);
      // Stays PENDING (W2 step 5)
      throw new BadRequestException(
        `Ledger consent write failed: ${err instanceof Error ? err.message : String(err)}. Request remains PENDING for retry.`,
      );
    }

    // Only after ledger commits: write ConsentGrant and update AccessRequest
    const consentGrant = await this.prisma.consentGrant.create({
      data: {
        consentId,
        requestId: request.id,
        businessRef: business.businessRef,
        institutionId: institution.id,
        scopeType: request.scopeType,
        docRefs: approvedDocs,
        expiresAt,
        status: 'ACTIVE',
        ledgerTxId,
      },
    });

    const updatedRequest = await this.prisma.accessRequest.update({
      where: { id: request.id },
      data: {
        status: finalStatus,
        decidedAt: now,
        decidedByUserId: ownerUserId,
        allowDownload: dto.allowDownload ?? request.allowDownload,
      },
    });

    // Notify institution officer
    await this.notificationsService.notify({
      userId: request.requestedByUserId,
      type: 'REQUEST_DECIDED',
      entityType: 'AccessRequest',
      entityId: request.id,
    });

    await this.auditService.record({
      actor: ownerUserId,
      businessId,
      institutionId: request.institutionId,
      action: finalStatus === 'APPROVED' ? 'REQUEST_APPROVED' : 'REQUEST_PARTIALLY_APPROVED',
      entityType: 'AccessRequest',
      entityId: request.id,
      ledgerTxId,
      metadata: {
        consentId,
        status: finalStatus,
        approvedDocsCount: approvedDocs.length,
      },
    });

    return {
      request: updatedRequest,
      consentGrant: {
        consentId: consentGrant.consentId,
        scopeType: consentGrant.scopeType,
        docRefs: consentGrant.docRefs,
        expiresAt: consentGrant.expiresAt,
        status: consentGrant.status,
      },
    };
  }

  async getBusinessRequests(businessId: string) {
    return this.prisma.accessRequest.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequestById(businessId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, businessId },
    });
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    return request;
  }

  async getInstitutionRequests(institutionId: string) {
    return this.prisma.accessRequest.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
