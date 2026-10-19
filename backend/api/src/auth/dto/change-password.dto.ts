import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123!' })
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @ApiProperty({ example: 'NewSecretPassword2026!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(12, { message: 'New password must be at least 12 characters' })
  newPassword!: string;
}
