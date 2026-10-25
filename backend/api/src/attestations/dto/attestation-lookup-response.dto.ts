import { ApiProperty } from '@nestjs/swagger';

export class IssuerInstitutionDto {
  @ApiProperty({ example: 'inst-bank-a' })
  id: string;

  @ApiProperty({ example: 'State Bank of India' })
  name: string;

  @ApiProperty({ example: 'BANK' })
  type: string;

  @ApiProperty({ example: 'BankAOrgMSP' })
  mspId: string;
}

export class AttestationLookupResponseDto {
  @ApiProperty({ description: 'On-chain attestation UUID', example: 'att-uuid-101' })
  attId: string;

  @ApiProperty({ description: 'Pseudonymous business UUID', example: 'biz-ref-xyz-123' })
  businessRef: string;

  @ApiProperty({ description: 'Issuing institution profile' })
  issuerInstitution: IssuerInstitutionDto;

  @ApiProperty({ description: 'Attestation verification type', example: 'KYC_BASIC' })
  type: string;

  @ApiProperty({
    description: 'Current authoritative status (VALID, SUSPENDED, REVOKED, or EXPIRED)',
    example: 'VALID',
  })
  status: 'VALID' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';

  @ApiProperty({ description: 'Timestamp of on-chain issuance (UTC)', example: '2026-10-25T10:00:00.000Z' })
  issuedAt: string;

  @ApiProperty({ description: 'Expiry timestamp (UTC)', example: '2027-10-25T10:00:00.000Z' })
  validUntil: string;

  @ApiProperty({
    description: 'Cryptographic comparison: true if all attested document hashes match current authoritative on-chain versions',
    example: true,
  })
  documentsUnchangedSinceAttestation: boolean;
}
