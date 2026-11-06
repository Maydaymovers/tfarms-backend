import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class OnboardVendorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  /** Service requests only; ignored for hotel members. */
  @IsOptional()
  @IsString()
  hotelId?: string;
}
