import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Rail } from '@prisma/client';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreatePayoutDto {
  @IsString()
  @IsNotEmpty()
  vendorId!: string;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal string with at most 2 decimal places',
  })
  amount!: string;

  @Transform(upper)
  @IsEnum(Rail)
  rail!: Rail;
}
