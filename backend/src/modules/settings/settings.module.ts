import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [FamilyModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
