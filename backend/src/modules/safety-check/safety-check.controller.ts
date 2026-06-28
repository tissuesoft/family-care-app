import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SafetyCheckService } from './safety-check.service';

@Controller('v1/safety-checks')
@UseGuards(SupabaseAuthGuard)
export class SafetyCheckController {
  constructor(private readonly safetyCheckService: SafetyCheckService) {}

  @Post()
  complete(
    @CurrentUser() user: User,
    @Body() body: { check_date?: string },
  ) {
    return this.safetyCheckService.completeToday(user.id, body.check_date);
  }

  @Get()
  history(
    @CurrentUser() user: User,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.safetyCheckService.listHistory(user.id, from, to);
  }
}
