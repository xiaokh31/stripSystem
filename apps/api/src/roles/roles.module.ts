import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsController, RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [PrismaModule],
  controllers: [RolesController, PermissionsController],
  providers: [RolesService],
})
export class RolesModule {}
