import { IsString, Matches } from 'class-validator';

export class SetQboVendorIdDto {
  @IsString()
  @Matches(/^[0-9A-Za-z]{1,20}$/)
  qboVendorId!: string;
}
