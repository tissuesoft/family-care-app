import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { StepsService } from './steps.service';

@Controller('v1/steps')
@UseGuards(SupabaseAuthGuard)
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Put('sync')
  sync(
    @CurrentUser() user: User,
    @Body()
    body: {
      step_date: string;
      total_steps: number;
      calories_kcal?: number;
      distance_km?: number;
      duration_minutes?: number;
      hourly?: { recorded_at: string; steps: number }[];
    },
  ) {
    return this.stepsService.sync(user.id, body);
  }

  @Get('family/today')
  familyToday(
    @CurrentUser() user: User,
    @Query('group_id') groupId: string,
  ) {
    return this.stepsService.familyToday(user.id, groupId);
  }
}
