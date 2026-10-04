import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RoutingInput } from '../routing/ach-routing.service';

export class RoutingInputDto implements RoutingInput {
  @IsString()
  @IsNotEmpty()
  vendorId!: string;

  @IsString()
  amount!: string;

  @IsString()
  rail!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
