import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Headers,
  Req,
  Res,
  UseGuards,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { SessionGuard, SESSION_COOKIE_NAME } from '../auth/session.guard';
import { RolesGuard } from '../policy/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ShareCodeService } from './share-code.service';
import { RequestsService } from './requests.service';
import { ConsentService } from './consent.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { CreateShareCodeDto } from './dto/create-share-code.dto';
import { ConfirmShareCodeDto } from './dto/confirm-share-code.dto';
import { DecideRequestDto } from './dto/decide-request.dto';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

@ApiTags('Business Consent & Share Codes')
@Controller('business')
@UseGuards(SessionGuard, RolesGuard)
export class BusinessConsentController {
  constructor(
    private readonly shareCodeService: ShareCodeService,
    private readonly requestsService: RequestsService,
    private readonly consentService: ConsentService,
    private readonly idempotencyService: IdempotencyService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private getBusinessId(user: AuthenticatedUser): string {
    if (!user || !user.businessId) {
      throw new ForbiddenException('User is not associated with an active business profile');
    }
    return user.businessId;
  }

  // --- Registration & Profile (§11.2) ---

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Self-onboards MSME business & owner (§11.2)' })
  @ApiResponse({ status: 201, description: 'Business and owner created, session initialized' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(
    @Body() dto: RegisterBusinessDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = dto.email.toLowerCase().trim();

    // Check if account already exists
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    // Hash password with argon2id (spec standard)
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        phone: dto.phone?.trim() || null,
        role: UserRole.BUSINESS_OWNER,
        status: UserStatus.ACTIVE,
        passwordHash,
        mustChangePassword: false,
      },
    });

    // Create business
    const businessRef = crypto.randomUUID();
    const identifiers = JSON.stringify({
      gstin: dto.gstin?.trim() || null,
      businessType: dto.businessType?.trim() || null,
    });
    const contact = JSON.stringify({
      ownerName: dto.ownerName.trim(),
      phone: dto.phone?.trim() || null,
    });

    const business = await this.prisma.business.create({
      data: {
        businessRef,
        legalName: dto.legalName.trim(),
        identifiers,
        contact,
        ownerUserId: user.id,
      },
    });

    // Associate business with user
    await this.prisma.user.update({
      where: { id: user.id },
      data: { businessId: business.id },
    });

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';

    // Record audit event
    await this.auditService.record({
      actor: user.id,
      action: 'AUTH_REGISTER_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      businessId: business.id,
      metadata: {
        ip,
        businessRef,
        legalName: business.legalName,
      },
    });

    // Create session (8 hour absolute, 30 minute idle)
    const sessionResult = await this.authService.createSession(user.id, ip, userAgent);

    // Set secure session cookie
    res.cookie(SESSION_COOKIE_NAME, sessionResult.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        institutionId: null,
        institutionName: null,
        institutionStatus: null,
        institutionMspId: null,
        businessId: business.id,
        businessName: business.legalName,
        mustChangePassword: false,
      },
      csrfToken: sessionResult.csrfToken,
    };
  }

  @Get('me')
  @Roles(UserRole.BUSINESS_OWNER, UserRole.BUSINESS_EMPLOYEE)
  @ApiOperation({ summary: 'Get business profile for authenticated caller (§11.2)' })
  @ApiResponse({ status: 200, description: 'Business profile returned' })
  async getBusinessProfile(@Req() req: { user: AuthenticatedUser }) {
    const businessId = this.getBusinessId(req.user);
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business profile not found');
    }

    let identifiersObj: Record<string, any> = {};
    let contactObj: Record<string, any> = {};
    try {
      identifiersObj = JSON.parse(business.identifiers || '{}');
    } catch {}
    try {
      contactObj = JSON.parse(business.contact || '{}');
    } catch {}

    return {
      id: business.id,
      businessRef: business.businessRef,
      legalName: business.legalName,
      gstin: identifiersObj.gstin || null,
      pan: identifiersObj.pan || null,
      businessType: identifiersObj.businessType || null,
      ownerName: contactObj.ownerName || null,
      phone: contactObj.phone || null,
      city: contactObj.city || null,
      state: contactObj.state || null,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }

  @Patch('me')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Update business profile (§11.2)' })
  @ApiResponse({ status: 200, description: 'Business profile updated' })
  async updateBusinessProfile(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: UpdateBusinessProfileDto,
  ) {
    const businessId = this.getBusinessId(req.user);
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business profile not found');
    }

    let identifiersObj: Record<string, any> = {};
    let contactObj: Record<string, any> = {};
    try {
      identifiersObj = JSON.parse(business.identifiers || '{}');
    } catch {}
    try {
      contactObj = JSON.parse(business.contact || '{}');
    } catch {}

    if (dto.gstin !== undefined) identifiersObj.gstin = dto.gstin;
    if (dto.pan !== undefined) identifiersObj.pan = dto.pan;
    if (dto.businessType !== undefined) identifiersObj.businessType = dto.businessType;
    if (dto.phone !== undefined) contactObj.phone = dto.phone;
    if (dto.ownerName !== undefined) contactObj.ownerName = dto.ownerName;
    if (dto.city !== undefined) contactObj.city = dto.city;
    if (dto.state !== undefined) contactObj.state = dto.state;

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        legalName: dto.legalName ? dto.legalName.trim() : business.legalName,
        identifiers: JSON.stringify(identifiersObj),
        contact: JSON.stringify(contactObj),
      },
    });

    return {
      id: updated.id,
      businessRef: updated.businessRef,
      legalName: updated.legalName,
      gstin: identifiersObj.gstin || null,
      pan: identifiersObj.pan || null,
      businessType: identifiersObj.businessType || null,
      phone: contactObj.phone || null,
      ownerName: contactObj.ownerName || null,
      city: contactObj.city || null,
      state: contactObj.state || null,
      updatedAt: updated.updatedAt,
    };
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

  @Get('share-codes/:id/dev-otp')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Retrieve local development OTP for active share-code challenge' })
  @ApiResponse({ status: 200, description: 'Development OTP details' })
  @ApiResponse({ status: 403, description: 'Disabled in production' })
  async getDevOtp(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.shareCodeService.getDevOtpForShareCode(
      businessId,
      req.user.id,
      id,
    );
  }

  @Post('share-codes/:id/resend')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Resend OTP challenge for a pending share code request' })
  @ApiResponse({ status: 200, description: 'New OTP challenge issued' })
  async resendShareCodeOtp(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.shareCodeService.resendShareCodeOtp(
      businessId,
      req.user.id,
      id,
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

  @Get('requests/:id/dev-otp')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Retrieve local development OTP for active request approval challenge' })
  @ApiResponse({ status: 200, description: 'Development OTP details' })
  @ApiResponse({ status: 403, description: 'Disabled in production' })
  async getRequestDevOtp(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.requestsService.getDevOtpForRequest(
      businessId,
      req.user.id,
      id,
    );
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
