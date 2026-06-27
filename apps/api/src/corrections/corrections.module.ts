import { Module } from '@nestjs/common';
import { ContainerDestinationsController } from './container-destinations.controller';
import { ContainersController } from './containers.controller';
import { CorrectionsController } from './corrections.controller';
import { CorrectionsService } from './corrections.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    ContainersController,
    ContainerDestinationsController,
    CorrectionsController,
  ],
  providers: [CorrectionsService],
})
export class CorrectionsModule {}
