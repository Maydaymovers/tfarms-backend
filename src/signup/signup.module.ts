import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VendorsService } from '../vendors/vendors.service';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

@Module({
  imports: [PrismaModule],
  controllers: [SignupController],
  providers: [SignupService, VendorsService],
})
export class SignupModule {}
