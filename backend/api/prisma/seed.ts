import { PrismaClient, InstitutionType, InstitutionStatus, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding TrustLedger database with initial synthetic data...');

  // Common default password for seed users: "TrustLedger123!"
  const passwordHash = await argon2.hash('TrustLedger123!', {
    type: argon2.argon2id,
  });

  // 1. PlatformOrg
  const platformOrg = await prisma.institution.upsert({
    where: { id: '65f000000000000000000001' },
    update: {},
    create: {
      id: '65f000000000000000000001',
      name: 'TrustLedger Platform Operator',
      type: InstitutionType.PLATFORM,
      mspId: 'PlatformOrgMSP',
      status: InstitutionStatus.ACTIVE,
    },
  });

  // Platform Super Admin
  await prisma.user.upsert({
    where: { email: 'superadmin@trustledger.internal' },
    update: {},
    create: {
      id: '65f000000000000000000011',
      email: 'superadmin@trustledger.internal',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      institutionId: platformOrg.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // 2. Bank A (Issuing Bank)
  const bankA = await prisma.institution.upsert({
    where: { id: '65f000000000000000000002' },
    update: {},
    create: {
      id: '65f000000000000000000002',
      name: 'Bank A Commercial Lending',
      type: InstitutionType.BANK,
      mspId: 'BankAOrgMSP',
      status: InstitutionStatus.ACTIVE,
    },
  });

  // Bank A Admin
  await prisma.user.upsert({
    where: { email: 'admin@banka.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000021',
      email: 'admin@banka.example.com',
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: bankA.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // Bank A KYC Officer
  await prisma.user.upsert({
    where: { email: 'kyc@banka.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000022',
      email: 'kyc@banka.example.com',
      role: UserRole.KYC_OFFICER,
      institutionId: bankA.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // Bank A Loan Officer
  await prisma.user.upsert({
    where: { email: 'loan@banka.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000023',
      email: 'loan@banka.example.com',
      role: UserRole.LOAN_OFFICER,
      institutionId: bankA.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // Bank A Compliance Officer
  await prisma.user.upsert({
    where: { email: 'compliance@banka.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000024',
      email: 'compliance@banka.example.com',
      role: UserRole.COMPLIANCE_OFFICER,
      institutionId: bankA.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // 3. NBFC (Inquiring NBFC)
  const nbfc = await prisma.institution.upsert({
    where: { id: '65f000000000000000000003' },
    update: {},
    create: {
      id: '65f000000000000000000003',
      name: 'FinFlow NBFC Capital',
      type: InstitutionType.NBFC,
      mspId: 'NbfcOrgMSP',
      status: InstitutionStatus.ACTIVE,
    },
  });

  // NBFC Admin
  await prisma.user.upsert({
    where: { email: 'admin@nbfc.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000031',
      email: 'admin@nbfc.example.com',
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: nbfc.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // NBFC KYC Officer
  await prisma.user.upsert({
    where: { email: 'kyc@nbfc.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000032',
      email: 'kyc@nbfc.example.com',
      role: UserRole.KYC_OFFICER,
      institutionId: nbfc.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // NBFC Loan Officer
  await prisma.user.upsert({
    where: { email: 'loan@nbfc.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000033',
      email: 'loan@nbfc.example.com',
      role: UserRole.LOAN_OFFICER,
      institutionId: nbfc.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // NBFC Compliance Officer
  await prisma.user.upsert({
    where: { email: 'compliance@nbfc.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000034',
      email: 'compliance@nbfc.example.com',
      role: UserRole.COMPLIANCE_OFFICER,
      institutionId: nbfc.id,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // 4. Demo Business Owner & Business
  const ownerUser = await prisma.user.upsert({
    where: { email: 'owner@acmetextiles.example.com' },
    update: {},
    create: {
      id: '65f000000000000000000041',
      email: 'owner@acmetextiles.example.com',
      role: UserRole.BUSINESS_OWNER,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  const business = await prisma.business.upsert({
    where: { businessRef: 'e4d8c83a-7963-4a6c-94ea-6d2c0b4cb101' },
    update: {},
    create: {
      id: '65f000000000000000000042',
      businessRef: 'e4d8c83a-7963-4a6c-94ea-6d2c0b4cb101',
      legalName: 'Acme Textiles & Handloom Private Limited',
      identifiers: JSON.stringify({
        pan: 'AAACA1234A',
        gstin: '27AAACA1234A1Z5',
        cin: 'U17110MH2015PTC123456',
      }),
      contact: JSON.stringify({
        phone: '+919876543210',
        city: 'Mumbai',
        state: 'Maharashtra',
      }),
      ownerUserId: ownerUser.id,
    },
  });

  // Link businessId to owner
  await prisma.user.update({
    where: { id: ownerUser.id },
    data: { businessId: business.id },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
