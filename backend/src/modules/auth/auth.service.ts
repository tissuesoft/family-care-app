import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async getMe(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id, display_name, birth_year, is_premium, step_daily_goal')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }
}
