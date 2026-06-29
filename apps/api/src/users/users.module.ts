import { Module } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, PasswordService],
})
export class UsersModule {}
