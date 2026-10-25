import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { RolesGuard } from '../policy/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AttestationsService } from './attestations.service';

@ApiTags('Business Attestations')
@Controller('business/attestations')
@UseGuards(SessionGuard, RolesGuard)
export class BusinessAttestationsController {
  constructor(private readonly attestationsService: AttestationsService) {}

  @Get()
  @Roles(UserRole.BUSINESS_OWNER)
  @ApiOperation({ summary: 'View all attestations issued for caller business' })
  @ApiResponse({ status: 200, description: 'List of business attestations' })
  @ApiResponse({ status: 403, description: 'Forbidden for non-business owners' })
  async getAttestations(@Req() req: { user: AuthenticatedUser }) {
    return this.attestationsService.getBusinessAttestations(req.user);
  }
}
