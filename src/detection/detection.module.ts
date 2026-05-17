import { Module } from '@nestjs/common';
import { DetectionService } from './detection.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  providers: [DetectionService, RateLimitService],
  exports: [DetectionService, RateLimitService],
})
export class DetectionModule {}
