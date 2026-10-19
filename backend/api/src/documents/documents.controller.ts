import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { RolesGuard } from '../policy/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UploadedFileDto } from './file-validator';

@ApiTags('Business Documents')
@Controller('business/documents')
@UseGuards(SessionGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  private getBusinessId(user: AuthenticatedUser): string {
    if (!user || !user.businessId) {
      throw new ForbiddenException('User is not associated with an active business profile');
    }
    return user.businessId;
  }

  @Get()
  @Roles(UserRole.BUSINESS_OWNER, UserRole.BUSINESS_EMPLOYEE)
  @ApiOperation({ summary: 'List all documents belonging to the caller business' })
  async listDocuments(@Req() req: { user: AuthenticatedUser }) {
    const businessId = this.getBusinessId(req.user);
    return this.documentsService.listDocuments(businessId);
  }

  @Post()
  @Roles(UserRole.BUSINESS_OWNER, UserRole.BUSINESS_EMPLOYEE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document (runs Section 7 encryption and ledger registration pipeline)' })
  @ApiResponse({ status: 201, description: 'Document uploaded and registered on-chain' })
  @ApiResponse({ status: 400, description: 'Invalid file type, oversize, or magic byte mismatch' })
  async uploadDocument(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('EMPTY_FILE: No file uploaded in multipart field "file"');
    }
    const businessId = this.getBusinessId(req.user);
    return this.documentsService.uploadDocument(businessId, dto.docType, file, req.user.email);
  }

  @Get(':id')
  @Roles(UserRole.BUSINESS_OWNER, UserRole.BUSINESS_EMPLOYEE)
  @ApiOperation({ summary: 'Get document metadata' })
  async getDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.documentsService.getDocumentById(businessId, id);
  }

  @Post(':id/retry-registration')
  @Roles(UserRole.BUSINESS_OWNER, UserRole.BUSINESS_EMPLOYEE)
  @ApiOperation({ summary: 'Retry ledger registration for a document stuck in PENDING_REGISTRATION' })
  async retryRegistration(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.documentsService.retryRegistration(businessId, id, req.user.email);
  }

  @Get(':id/view')
  @Roles(UserRole.BUSINESS_OWNER, UserRole.BUSINESS_EMPLOYEE)
  @ApiOperation({ summary: 'Owner views own decrypted document content' })
  async viewDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const businessId = this.getBusinessId(req.user);
    const result = await this.documentsService.viewDocumentByOwner(businessId, id);

    res.setHeader('Content-Type', result.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  }

  @Put(':id')
  @Roles(UserRole.BUSINESS_OWNER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Replace a document with new version n+1 (blocked by D-12 if active consent exists)' })
  @ApiResponse({ status: 200, description: 'Document replaced with new version' })
  @ApiResponse({ status: 409, description: 'Active consent exists referencing this document (D-12)' })
  async replaceDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('EMPTY_FILE: No file uploaded in multipart field "file"');
    }
    const businessId = this.getBusinessId(req.user);
    return this.documentsService.replaceDocument(businessId, id, file, req.user.email);
  }

  @Delete(':id')
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Delete a document via crypto-shredding (blocked by D-12 if active consent exists)' })
  @ApiResponse({ status: 200, description: 'Document ciphertext and keys shredded' })
  @ApiResponse({ status: 409, description: 'Active consent exists referencing this document (D-12)' })
  async deleteDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const businessId = this.getBusinessId(req.user);
    return this.documentsService.deleteDocument(businessId, id, req.user.email);
  }
}
