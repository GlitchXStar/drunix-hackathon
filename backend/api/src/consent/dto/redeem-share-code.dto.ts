import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemShareCodeDto {
  @ApiProperty({
    description: '8-character profile share code',
    example: 'K7H9P2MN',
  })
  @IsNotEmpty()
  @IsString()
  @Length(8, 8)
  code: string;
}
