import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBusinessProfileDto {
  @ApiPropertyOptional({ example: 'Acme Textiles & Handloom Private Limited' })
  @IsString()
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional({ example: '27AAACA1234A1Z5' })
  @IsString()
  @IsOptional()
  gstin?: string;

  @ApiPropertyOptional({ example: 'AAACA1234A' })
  @IsString()
  @IsOptional()
  pan?: string;

  @ApiPropertyOptional({ example: 'Services' })
  @IsString()
  @IsOptional()
  businessType?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Gaurav' })
  @IsString()
  @IsOptional()
  ownerName?: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsString()
  @IsOptional()
  state?: string;
}
