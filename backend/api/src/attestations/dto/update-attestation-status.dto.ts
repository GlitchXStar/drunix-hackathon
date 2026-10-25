import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAttestationStatusDto {
  @ApiProperty({
    description: 'New status for attestation (must be SUSPENDED or REVOKED, reinstatement is prohibited per D-9)',
    enum: ['SUSPENDED', 'REVOKED'],
    example: 'SUSPENDED',
  })
  @IsString()
  @IsIn(['SUSPENDED', 'REVOKED'], {
    message: 'Status must be either SUSPENDED or REVOKED (reinstatement to VALID is prohibited per D-9)',
  })
  status: 'SUSPENDED' | 'REVOKED';

  @ApiProperty({
    description: 'Operational reason code justifying the suspension or revocation',
    example: 'SUSPICIOUS_ACTIVITY_REPORTED',
  })
  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}
