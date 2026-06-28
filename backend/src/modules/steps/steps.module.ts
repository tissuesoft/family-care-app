import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { StepsController } from './steps.controller';
import { StepsService } from './steps.service';

@Module({
  imports: [FamilyModule],
  controllers: [StepsController],
  providers: [StepsService],
})
export class StepsModule {}
