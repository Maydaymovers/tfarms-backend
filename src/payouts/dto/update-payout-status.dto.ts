import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class UpdatePayoutStatusDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(PayoutStatus)
  status!: PayoutStatus;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  @IsString()
  failureReason?: string;

  /** Recorded in the status history. Required when reversing a COMPLETED payout. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
