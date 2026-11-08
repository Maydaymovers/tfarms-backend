import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VendorStatus } from '@prisma/client';

export class UpdateVendorStatusDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(VendorStatus)
  status!: VendorStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
