import { Global, Module } from '@nestjs/common';
import { BusinessTimeService, ServerClock } from './business-time.service';

@Global()
@Module({
  providers: [ServerClock, BusinessTimeService],
  exports: [ServerClock, BusinessTimeService],
})
export class BusinessTimeModule {}
