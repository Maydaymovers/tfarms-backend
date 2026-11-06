import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateHotelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
