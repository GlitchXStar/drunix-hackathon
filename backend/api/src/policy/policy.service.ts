import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, InstitutionStatus, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Permission, hasPermission } from './policy.matrix';

@Injectable()
export class PolicyService {
  /**
   * Validate that the user role has the required permission
   */
  assertPermission(role: UserRole, permission: Permission): void {
    if (!hasPermission(role, permission)) {
      throw new ForbiddenException(`Role ${role} is not authorized for ${permission}`);
    }
  }

  /**
   * Validate institution tenant boundary and active status (I-5)
   */
  assertInstitutionAccess(user: AuthenticatedUser, targetInstitutionId: string): void {
    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      return; // Platform Super Admin operates platform-wide
    }

    if (user.institutionStatus === InstitutionStatus.SUSPENDED) {
      throw new ForbiddenException('INSTITUTION_SUSPENDED: Your institution is suspended');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    if (!user.institutionId || user.institutionId !== targetInstitutionId) {
      // Return 404 to avoid leaking existence of cross-tenant resource (§11.1)
      throw new NotFoundException('Resource not found');
    }
  }

  /**
   * Validate business tenant boundary
   */
  assertBusinessAccess(user: AuthenticatedUser, targetBusinessId: string): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    if (!user.businessId || user.businessId !== targetBusinessId) {
      // Return 404 to avoid leaking existence of cross-tenant resource (§11.1)
      throw new NotFoundException('Resource not found');
    }
  }
}
