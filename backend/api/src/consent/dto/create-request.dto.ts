import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsArray,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRequestDto {
  @ApiProperty({
    description: 'Target business ID for the access request',
    example: '60d5ec49f1b2c8b1f8e4e1a1',
  })
  @IsNotEmpty()
  @IsString()
  businessId: string;

  @ApiProperty({
    description: 'Scope type: DOCUMENTS or FEATURES',
    enum: ['DOCUMENTS', 'FEATURES'],
    example: 'DOCUMENTS',
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['DOCUMENTS', 'FEATURES'])
  scopeType: 'DOCUMENTS' | 'FEATURES';

  @ApiPropertyOptional({
    description: 'Requested document types',
    type: [String],
    example: ['GST_CERTIFICATE', 'BANK_STATEMENT'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestedDocTypes?: string[];

  @ApiProperty({
    description: 'Standardized purpose code (e.g. KYC_VERIFICATION, LOAN_APPRAISAL)',
    example: 'KYC_VERIFICATION',
  })
  @IsNotEmpty()
  @IsString()
  purposeCode: string;

  @ApiPropertyOptional({
    description: 'Requested duration in minutes (default: 43200 = 30 days max)',
    default: 43200,
    example: 10080,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200)
  requestedDurationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Whether download permission is requested',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @ApiPropertyOptional({
    description: 'Optional message to business owner (max 280 characters)',
    maxLength: 280,
    example: 'Please share your GST certificate and 6-month bank statement for credit appraisal.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string;
}
