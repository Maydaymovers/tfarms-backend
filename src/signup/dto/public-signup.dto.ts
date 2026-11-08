import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PublicSignupDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  contactEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  turnstileToken!: string;

  /** Honeypot: hidden in the page, real visitors never fill it. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}
