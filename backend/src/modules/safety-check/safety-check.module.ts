import { Module } from '@nestjs/common';
import { SafetyCheckController } from './safety-check.controller';
import { SafetyCheckService } from './safety-check.service';

@Module({
  controllers: [SafetyCheckController],
  providers: [SafetyCheckService],
})
export class SafetyCheckModule {}
