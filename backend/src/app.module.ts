import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { FamilyModule } from './modules/family/family.module';
import { HomeModule } from './modules/home/home.module';
import { SafetyCheckModule } from './modules/safety-check/safety-check.module';
import { MoodModule } from './modules/mood/mood.module';
import { MedicationModule } from './modules/medication/medication.module';
import { StepsModule } from './modules/steps/steps.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    FamilyModule,
    HomeModule,
    SafetyCheckModule,
    MoodModule,
    MedicationModule,
    StepsModule,
    SettingsModule,
  ],
})
export class AppModule {}
