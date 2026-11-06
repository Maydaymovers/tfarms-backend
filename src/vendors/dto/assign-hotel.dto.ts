import { IsNotEmpty, IsString } from 'class-validator';

export class AssignHotelDto {
  @IsString()
  @IsNotEmpty()
  hotelId!: string;
}
