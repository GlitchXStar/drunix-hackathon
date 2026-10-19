import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { RolesGuard } from '../policy/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ShareCodeService } from './share-code.service';
import { RequestsService } from './requests.service';
import { ConsentService } from './consent.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { RedeemShareCodeDto } from './dto/redeem-share-code.dto';
import { CreateRequestDto } from './dto/create-request.dto';

@ApiTags('Institution Consent & Requests')
@Controller('institution')
@UseGuards(SessionGuard, RolesGuard)
export class InstitutionConsentController {
  constructor(
    private readonly shareCodeService: ShareCodeService,
    private readonly requestsService: RequestsService,
    private readonly consentService: ConsentService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  private getInstitutionId(user: AuthenticatedUser): string {
    if (!user || !user.institutionId) {
      throw new ForbiddenException('User is not associated with an active institution');
    }
    return user.institutionId;
  }

  @Post('profile-lookup')
  @Roles(UserRole.KYC_OFFICER, UserRole.LOAN_OFFICER)
  @ApiOperation({ summary: 'Redeem 8-character profile share code for PROFILE consent (W2 step 2)' })
  @ApiResponse({ status: 200, description: 'Share code redeemed; returns legal name and consent ID' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded on redemption attempts (S-10)' })
  async redeemShareCode(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: RedeemShareCodeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const institutionId = this.getInstitutionId(req.user);
    return this.idempotencyService.execute(idempotencyKey, async () => {
      return this.shareCodeService.redeemShareCode(
        institutionId,
        req.user.id,
        dto.code,
      );
    });
  }

  @Post('requests')
  @Roles(UserRole.KYC_OFFICER, UserRole.LOAN_OFFICER)
  @ApiOperation({ summary: 'Create a DOCUMENTS or FEATURES access request (W2 step 3)' })
  @ApiResponse({ status: 201, description: 'Access request created and owner notified' })
  async createRequest(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateRequestDto,
  ) {
    const institutionId = this.getInstitutionId(req.user);
    return this.requestsService.createRequest(institutionId, req.user.id, dto);
  }

  @Get('requests')
  @Roles(
    UserRole.KYC_OFFICER,
    UserRole.LOAN_OFFICER,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.INSTITUTION_ADMIN,
  )
  @ApiOperation({ summary: 'List access requests submitted by this institution' })
  async listRequests(@Req() req: { user: AuthenticatedUser }) {
    const institutionId = this.getInstitutionId(req.user);
    return this.requestsService.getInstitutionRequests(institutionId);
  }

  @Post('requests/:id/cancel')
  @Roles(UserRole.KYC_OFFICER, UserRole.LOAN_OFFICER)
  @ApiOperation({ summary: 'Cancel a pending access request (W2 step 7)' })
  async cancelRequest(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const institutionId = this.getInstitutionId(req.user);
    return this.requestsService.cancelRequest(institutionId, req.user.id, id);
  }

  @Get('consents')
  @Roles(UserRole.KYC_OFFICER, UserRole.LOAN_OFFICER, UserRole.COMPLIANCE_OFFICER)
  @ApiOperation({ summary: 'List active and historical consent grants held by institution' })
  async listConsents(@Req() req: { user: AuthenticatedUser }) {
    const institutionId = this.getInstitutionId(req.user);
    return this.consentService.getInstitutionConsents(institutionId);
  }
}
