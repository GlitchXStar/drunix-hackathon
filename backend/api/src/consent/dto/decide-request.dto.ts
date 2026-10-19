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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DecideRequestDto {
  @ApiProperty({
    description: 'Decision outcome: APPROVE or REJECT',
    enum: ['APPROVE', 'REJECT'],
    example: 'APPROVE',
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({
    description: '6-digit OTP code for customer approval (required when approving)',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  otpCode?: string;

  @ApiPropertyOptional({
    description: 'Approved document reference IDs (for per-document selection)',
    type: [String],
    example: ['doc-uuid-1', 'doc-uuid-2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedDocRefs?: string[];

  @ApiPropertyOptional({
    description: 'Adjusted/shortened consent duration in minutes (max 30 days = 43200)',
    example: 10080,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Whether download permission is approved by owner',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;
}
