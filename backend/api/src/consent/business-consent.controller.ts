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
  HttpCode,
  HttpStatus,
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
import { CreateShareCodeDto } from './dto/create-share-code.dto';
import { ConfirmShareCodeDto } from './dto/confirm-share-code.dto';
import { DecideRequestDto } from './dto/decide-request.dto';

@ApiTags('Business Consent & Share Codes')
@Controller('business')
@UseGuards(SessionGuard, RolesGuard)
export class BusinessConsentController {
  constructor(
    private readonly shareCodeService: ShareCodeService,
    private readonly requestsService: RequestsService,
    private readonly consentService: ConsentService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  private getBusinessId(user: AuthenticatedUser): string {
    if (!user || !user.businessId) {
      throw new ForbiddenException('User is not associated with an active business profile');
    }
    return user.businessId;
  }

  // --- Profile Share Codes (§10 W2) ---

  @Post('share-codes')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Request a profile share code challenge (issues approval OTP)' })
  @ApiResponse({ status: 201, description: 'OTP challenge issued to owner' })
  async createShareCode(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateShareCodeDto,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.shareCodeService.createShareCodeChallenge(
      businessId,
      req.user.id,
      dto.durationMinutes,
    );
  }

  @Post('share-codes/:id/confirm')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Confirm OTP to receive 8-character share code (shown once)' })
  @ApiResponse({ status: 200, description: 'Returns 8-character code and expiration' })
  async confirmShareCode(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: ConfirmShareCodeDto,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.shareCodeService.confirmShareCode(
      businessId,
      req.user.id,
      id,
      dto.otpCode,
    );
  }

  // --- Access Requests (§10 W2) ---

  @Get('requests')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'List incoming access requests for caller business' })
  async listRequests(@Req() req: { user: AuthenticatedUser }) {
    const businessId = this.getBusinessId(req.user);
    return this.requestsService.getBusinessRequests(businessId);
  }

  @Get('requests/:id')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Get details of an incoming access request' })
  async getRequest(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.requestsService.getRequestById(businessId, id);
  }

  @Post('requests/:id/otp')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Request OTP challenge to approve access request' })
  @ApiResponse({ status: 201, description: 'Approval OTP issued' })
  async issueApprovalOtp(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.requestsService.issueApprovalOtp(businessId, req.user.id, id);
  }

  @Post('requests/:id/decision')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Approve (with OTP & document selection) or reject access request' })
  @ApiResponse({ status: 200, description: 'Request decided; writes consent grant on ledger if approved' })
  async decideRequest(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: DecideRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.idempotencyService.execute(idempotencyKey, async () => {
      return this.requestsService.decideRequest(businessId, req.user.id, id, dto);
    });
  }

  // --- Consents Management & Revocation (§10 W2 step 6) ---

  @Get('consents')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'List active and historical consent grants for business' })
  async listConsents(@Req() req: { user: AuthenticatedUser }) {
    const businessId = this.getBusinessId(req.user);
    return this.consentService.getBusinessConsents(businessId);
  }

  @Post('consents/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Revoke an active consent grant (terminates sessions and updates ledger)' })
  @ApiResponse({ status: 200, description: 'Consent grant revoked' })
  async revokeConsent(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.idempotencyService.execute(idempotencyKey, async () => {
      return this.consentService.revokeConsent(businessId, req.user.id, id);
    });
  }
}
