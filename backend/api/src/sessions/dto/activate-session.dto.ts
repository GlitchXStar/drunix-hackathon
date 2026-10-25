import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ActivateSessionDto {
  @ApiProperty({ description: '6-digit activation OTP code delivered to the officer' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'OTP code must be exactly 6 digits' })
  otpCode: string;
}
