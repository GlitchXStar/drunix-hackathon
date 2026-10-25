import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemShareCodeDto {
  @ApiProperty({
    description: '8-character profile share code',
    example: 'K7H9P2MN',
  })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      : value,
  )
  @MinLength(8)
  @MaxLength(8)
  code: string;
}

