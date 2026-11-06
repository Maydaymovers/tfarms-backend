import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { HotelRole } from '@prisma/client';

export class AddMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  wixMemberId!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(HotelRole)
  role?: HotelRole;
}
