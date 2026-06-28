import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { HomeService } from './home.service';

@Controller('v1/home')
@UseGuards(SupabaseAuthGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHome(@CurrentUser() user: User, @Query('group_id') groupId?: string) {
    return this.homeService.getDashboard(user.id, groupId);
  }
}
