import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueAttestationDto {
  @ApiProperty({ description: 'ID of the eligible VERIFIED KYC review', example: 'review-uuid-123' })
  @IsString()
  @IsNotEmpty()
  kycReviewId: string;

  @ApiPropertyOptional({ description: 'Validity period in months (default: 12, max: 24 per SPEC §8.5)', default: 12, minimum: 1, maximum: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  validityMonths?: number;

  @ApiPropertyOptional({ description: 'Attestation type (default: KYC_BASIC)', default: 'KYC_BASIC' })
  @IsOptional()
  @IsString()
  type?: string;
}
