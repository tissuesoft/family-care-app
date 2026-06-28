import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SettingsService } from './settings.service';

@Controller('v1/settings')
@UseGuards(SupabaseAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(
    @CurrentUser() user: User,
    @Query('group_id') groupId?: string,
  ) {
    return this.settingsService.getSettings(user.id, groupId);
  }
}
