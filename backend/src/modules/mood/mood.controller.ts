import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { MoodService } from './mood.service';

@Controller('v1/mood')
@UseGuards(SupabaseAuthGuard)
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  @Put('today')
  upsertToday(
    @CurrentUser() user: User,
    @Body() body: { mood_level: number },
  ) {
    return this.moodService.upsertToday(user.id, body.mood_level);
  }

  @Get('today')
  getToday(@CurrentUser() user: User) {
    return this.moodService.getToday(user.id);
  }
}
