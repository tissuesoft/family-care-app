import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { AuthService } from './auth.service';

@Controller('v1/auth')
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.authService.getMe(user.id);
  }

  @Post('logout')
  logout() {
    return { success: true };
  }
}
