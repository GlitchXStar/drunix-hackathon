import { UserRole } from '@prisma/client';
import { Permission, PERMISSION_MATRIX, hasPermission } from './policy.matrix';

describe('Policy Matrix (SPEC.md §9.2 Table-Driven Route-by-Role Test)', () => {
  const allRoles: UserRole[] = [
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.INSTITUTION_ADMIN,
    UserRole.KYC_OFFICER,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.LOAN_OFFICER,
    UserRole.BUSINESS_OWNER,
    UserRole.BUSINESS_EMPLOYEE,
  ];

  const allPermissions = Object.values(Permission);

  // Table-driven verification per permission against every single role
  const expectedMatrix: Record<Permission, Record<UserRole, boolean>> = {
    [Permission.INSTITUTION_MANAGE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: true,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.INSTITUTION_ADMIN_CREATE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: true,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.USER_MANAGE_OWN_INST]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: true,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.PLATFORM_AUDIT_VIEW]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: true,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.INSTITUTION_AUDIT_VIEW]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: true,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: true,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.SHARE_CODE_REDEEM]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: true,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: true,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.REQUEST_DOCUMENTS_CREATE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: true,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.REQUEST_FEATURES_CREATE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: true,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.DOCUMENT_VIEW_SESSION]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: true,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.ATTESTATION_MANAGE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: true,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.ATTESTATION_LOOKUP]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: true,
      [UserRole.COMPLIANCE_OFFICER]: true,
      [UserRole.LOAN_OFFICER]: true,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.ASSESSMENT_RUN_FINALISE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: true,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.ASSESSMENT_VIEW]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: true,
      [UserRole.LOAN_OFFICER]: true,
      [UserRole.BUSINESS_OWNER]: false,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.BUSINESS_MANAGE_PROFILE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: true,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
    [Permission.DOCUMENT_UPLOAD]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: true,
      [UserRole.BUSINESS_EMPLOYEE]: true,
    },
    [Permission.DOCUMENT_MUTATE_DELETE]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: true,
      [UserRole.BUSINESS_EMPLOYEE]: true,
    },
    [Permission.BUSINESS_ACCESS_HISTORY_VIEW]: {
      [UserRole.PLATFORM_SUPER_ADMIN]: false,
      [UserRole.INSTITUTION_ADMIN]: false,
      [UserRole.KYC_OFFICER]: false,
      [UserRole.COMPLIANCE_OFFICER]: false,
      [UserRole.LOAN_OFFICER]: false,
      [UserRole.BUSINESS_OWNER]: true,
      [UserRole.BUSINESS_EMPLOYEE]: false,
    },
  };

  test.each(allPermissions)('Permission %s matches exact role assignments', (perm) => {
    const expected = expectedMatrix[perm];
    for (const role of allRoles) {
      const allowed = hasPermission(role, perm);
      expect(allowed).toBe(expected[role]);
    }
  });

  it('DOCUMENT_VIEW_SESSION must NEVER be granted to PLATFORM_SUPER_ADMIN or INSTITUTION_ADMIN', () => {
    expect(hasPermission(UserRole.PLATFORM_SUPER_ADMIN, Permission.DOCUMENT_VIEW_SESSION)).toBe(false);
    expect(hasPermission(UserRole.INSTITUTION_ADMIN, Permission.DOCUMENT_VIEW_SESSION)).toBe(false);
  });

  it('Default deny on undefined permissions or roles', () => {
    expect(hasPermission('UNKNOWN_ROLE' as any, Permission.DOCUMENT_UPLOAD)).toBe(false);
    expect(hasPermission(UserRole.PLATFORM_SUPER_ADMIN, 'UNKNOWN_PERM' as any)).toBe(false);
  });
});
