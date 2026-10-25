import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'ID of the active DOCUMENTS consent grant' })
  @IsString()
  @IsNotEmpty()
  consentId: string;

  @ApiPropertyOptional({
    description: 'Requested session duration in minutes (default 30, maximum 120)',
    default: 30,
    minimum: 1,
    maximum: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  requestedDurationMinutes?: number;
}
