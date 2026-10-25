import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterBusinessDto {
  @ApiProperty({ example: 'Gaurav' })
  @IsString()
  @IsNotEmpty({ message: 'Owner full name is required' })
  ownerName!: string;

  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @ApiPropertyOptional({ example: '+919422124928' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  password!: string;

  @ApiProperty({ example: 'VIT, Pune' })
  @IsString()
  @IsNotEmpty({ message: 'Legal business name is required' })
  legalName!: string;

  @ApiPropertyOptional({ example: '27AAACA1234A1Z5' })
  @IsString()
  @IsOptional()
  gstin?: string;

  @ApiPropertyOptional({ example: 'Services' })
  @IsString()
  @IsOptional()
  businessType?: string;
}
