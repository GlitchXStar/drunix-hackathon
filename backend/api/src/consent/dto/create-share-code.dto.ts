import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShareCodeDto {
  @ApiPropertyOptional({
    description: 'Consent duration in minutes (default: 7 days = 10080, max 30 days = 43200)',
    default: 10080,
    example: 10080,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200)
  durationMinutes?: number;
}
