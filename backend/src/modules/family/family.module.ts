import { Module } from '@nestjs/common';
import { FamilyController, UserPreferencesController } from './family.controller';
import { FamilyService } from './family.service';

@Module({
  controllers: [FamilyController, UserPreferencesController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
