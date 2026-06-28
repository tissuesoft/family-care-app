import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { MedicationService } from './medication.service';

@Controller('v1/medications')
@UseGuards(SupabaseAuthGuard)
export class MedicationController {
  constructor(private readonly medicationService: MedicationService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.medicationService.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body()
    body: {
      name: string;
      dosage_text?: string;
      meal_time: 'morning' | 'lunch' | 'evening';
      scheduled_time: string;
    },
  ) {
    return this.medicationService.create(user.id, body);
  }

  @Get('family-status')
  familyStatus(
    @CurrentUser() user: User,
    @Query('group_id') groupId: string,
  ) {
    return this.medicationService.familyStatus(user.id, groupId);
  }

  @Post('intake-logs')
  logIntake(
    @CurrentUser() user: User,
    @Body()
    body: {
      medication_id: string;
      intake_date: string;
      status: 'taken' | 'missed' | 'pending' | 'scheduled';
      taken_at?: string;
    },
  ) {
    return this.medicationService.logIntake(user.id, body);
  }
}
