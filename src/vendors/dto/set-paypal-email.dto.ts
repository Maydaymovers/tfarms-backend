import { IsEmail } from 'class-validator';

export class SetPaypalEmailDto {
  @IsEmail()
  paypalEmail!: string;
}
