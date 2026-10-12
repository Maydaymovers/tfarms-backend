import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartOnboardingDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
