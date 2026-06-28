import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { todayKstDateString } from '../../common/utils/date.util';

@Injectable()
export class SafetyCheckService {
  constructor(private readonly supabase: SupabaseService) {}

  async completeToday(userId: string, checkDate?: string) {
    const date = checkDate ?? todayKstDateString();
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.admin
      .from('safety_checks')
      .upsert(
        {
          user_id: userId,
          check_date: date,
          status: 'completed',
          completed_at: now,
        },
        { onConflict: 'user_id,check_date' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listHistory(userId: string, from: string, to: string) {
    const { data, error } = await this.supabase.admin
      .from('safety_checks')
      .select('*')
      .eq('user_id', userId)
      .gte('check_date', from)
      .lte('check_date', to)
      .order('check_date', { ascending: false });
    if (error) throw error;
    return data;
  }
}
