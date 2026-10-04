import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LedgerEntryType } from '@prisma/client';

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  payoutId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(LedgerEntryType)
  type?: LedgerEntryType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
