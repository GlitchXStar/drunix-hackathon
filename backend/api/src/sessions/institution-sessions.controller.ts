import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { SessionGuard, SESSION_COOKIE_NAME } from '../auth/session.guard';
import { RolesGuard } from '../policy/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { ActivateSessionDto } from './dto/activate-session.dto';

@ApiTags('Institution Access Sessions')
@Controller('institution/sessions')
@UseGuards(SessionGuard, RolesGuard)
export class InstitutionSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  private extractSessionAndUserAgent(req: any): { serverSessionId: string; userAgent: string } {
    const serverSessionId = req.session?.sessionId || req.cookies?.[SESSION_COOKIE_NAME] || '';
    const userAgent = (req.headers['user-agent'] as string) || '';
    return { serverSessionId, userAgent };
  }

  @Post()
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Create an AccessSession in PENDING_OTP status' })
  @ApiResponse({ status: 201, description: 'Session created and activation OTP issued' })
  @ApiResponse({ status: 403, description: 'Ledger check denied or institution suspended' })
  @ApiResponse({ status: 409, description: 'Active session already exists for this consent' })
  async createSession(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateSessionDto,
  ) {
    const { serverSessionId, userAgent } = this.extractSessionAndUserAgent(req);
    return this.sessionsService.createSession(req.user, dto, serverSessionId, userAgent);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Activate an AccessSession with OTP (transitions to ACTIVE)' })
  @ApiResponse({ status: 200, description: 'Session activated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 403, description: 'Fingerprint mismatch or authorization revoked' })
  async activateSession(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: ActivateSessionDto,
  ) {
    const { serverSessionId, userAgent } = this.extractSessionAndUserAgent(req);
    return this.sessionsService.activateSession(req.user, id, dto, serverSessionId, userAgent);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Explicitly close an active AccessSession' })
  @ApiResponse({ status: 200, description: 'Session closed successfully' })
  async closeSession(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.sessionsService.closeSession(req.user, id);
  }

  @Get(':id/documents')
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'List approved documents accessible in the active session' })
  @ApiResponse({ status: 200, description: 'List of document metadata' })
  @ApiResponse({ status: 403, description: 'Session expired, revoked, or fingerprint mismatch' })
  async getSessionDocuments(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const { serverSessionId, userAgent } = this.extractSessionAndUserAgent(req);
    return this.sessionsService.getSessionDocuments(req.user, id, serverSessionId, userAgent);
  }

  @Get(':id/documents/:docRef/pages/:page')
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Render watermarked document page image (image/png)' })
  @ApiResponse({ status: 200, description: 'Rendered watermarked PNG image' })
  @ApiResponse({ status: 403, description: 'Access denied or tamper detected' })
  @ApiResponse({ status: 404, description: 'Page or document not found' })
  async viewDocumentPage(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Param('docRef') docRef: string,
    @Param('page', ParseIntPipe) page: number,
    @Res() res: Response,
  ) {
    const { serverSessionId, userAgent } = this.extractSessionAndUserAgent(req);
    const rendered = await this.sessionsService.renderDocumentPage(
      req.user,
      id,
      docRef,
      page,
      serverSessionId,
      userAgent,
    );

    res.setHeader('Content-Type', rendered.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(rendered.buffer);
  }

  @Get(':id/documents/:docRef/download')
  @Roles(UserRole.KYC_OFFICER)
  @ApiOperation({ summary: 'Download original document binary (allowed only if approved by owner)' })
  @ApiResponse({ status: 200, description: 'Original document binary stream' })
  @ApiResponse({ status: 403, description: 'Download not approved or access denied' })
  async downloadDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Param('docRef') docRef: string,
    @Res() res: Response,
  ) {
    const { serverSessionId, userAgent } = this.extractSessionAndUserAgent(req);
    const result = await this.sessionsService.downloadDocument(
      req.user,
      id,
      docRef,
      serverSessionId,
      userAgent,
    );

    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${result.docRef}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  }
}
