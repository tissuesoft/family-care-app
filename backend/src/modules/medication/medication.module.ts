import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { MedicationController } from './medication.controller';
import { MedicationService } from './medication.service';

@Module({
  imports: [FamilyModule],
  controllers: [MedicationController],
  providers: [MedicationService],
})
export class MedicationModule {}
