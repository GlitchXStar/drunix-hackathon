import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { RolesGuard } from '../policy/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AttestationsService } from './attestations.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { CreateKycReviewDto } from './dto/create-kyc-review.dto';
import { IssueAttestationDto } from './dto/issue-attestation.dto';
import { UpdateAttestationStatusDto } from './dto/update-attestation-status.dto';
import { AttestationLookupResponseDto } from './dto/attestation-lookup-response.dto';

@ApiTags('Institution KYC Reviews & Attestations')
@Controller('institution')
@UseGuards(SessionGuard, RolesGuard)
export class InstitutionAttestationsController {
  constructor(
    private readonly attestationsService: AttestationsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('kyc-reviews')
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Record private KYC review linked to an active session (W3 step 4)' })
  @ApiResponse({ status: 201, description: 'KYC review recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid checklist, outcome, or unviewed documents referenced' })
  @ApiResponse({ status: 403, description: 'Session not active, expired, or officer unauthorized' })
  async createKycReview(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateKycReviewDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(idempotencyKey, async () => {
      return this.attestationsService.createKycReview(req.user, dto);
    });
  }

  @Post('attestations')
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Issue KYC_BASIC attestation to Drunix for eligible VERIFIED review (W3 step 5)' })
  @ApiResponse({ status: 201, description: 'Attestation issued on Drunix with document hash snapshot' })
  @ApiResponse({ status: 400, description: 'Review not verified, missing documents, or invalid validity period' })
  @ApiResponse({ status: 403, description: 'Ledger unavailable or officer unauthorized (I-1 fail closed)' })
  @ApiResponse({ status: 409, description: 'Attestation already issued for this review' })
  async issueAttestation(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: IssueAttestationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(idempotencyKey, async () => {
      return this.attestationsService.issueAttestation(req.user, dto);
    });
  }

  @Patch('attestations/:id/status')
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Suspend or revoke own attestation (D-9 lifecycle rule)' })
  @ApiResponse({ status: 200, description: 'Attestation status updated on Drunix' })
  @ApiResponse({ status: 400, description: 'Invalid transition, expired attestation, or reinstatement attempted' })
  @ApiResponse({ status: 403, description: 'Caller did not issue attestation or institution suspended' })
  @ApiResponse({ status: 404, description: 'Attestation not found' })
  async updateAttestationStatus(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: UpdateAttestationStatusDto,
  ) {
    return this.attestationsService.updateAttestationStatus(req.user, id, dto);
  }

  @Get('consents/:consentId/attestations')
  @Roles(UserRole.KYC_OFFICER, UserRole.COMPLIANCE_OFFICER, UserRole.LOAN_OFFICER)
  @ApiOperation({ summary: 'Cross-institution attestation lookup via active PROFILE consent (W5)' })
  @ApiResponse({
    status: 200,
    description: 'List of attestations with dynamic expiry and document integrity comparison',
    type: [AttestationLookupResponseDto],
  })
  @ApiResponse({ status: 403, description: 'Ledger check denied, scope mismatch, or consent revoked/expired' })
  @ApiResponse({ status: 404, description: 'Consent grant not found' })
  async lookupAttestations(
    @Req() req: { user: AuthenticatedUser },
    @Param('consentId') consentId: string,
  ): Promise<AttestationLookupResponseDto[]> {
    return this.attestationsService.lookupAttestations(req.user, consentId);
  }
}
