import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { todayKstDateString } from '../../common/utils/date.util';

const MOOD_LABELS: Record<number, string> = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '기분 보통',
  4: '기분 좋음',
  5: '매우 좋음',
};

@Injectable()
export class MoodService {
  constructor(private readonly supabase: SupabaseService) {}

  async upsertToday(userId: string, moodLevel: number) {
    const date = todayKstDateString();
    const { data, error } = await this.supabase.admin
      .from('mood_logs')
      .upsert(
        { user_id: userId, log_date: date, mood_level: moodLevel },
        { onConflict: 'user_id,log_date' },
      )
      .select()
      .single();
    if (error) throw error;
    return {
      level: data.mood_level,
      label: MOOD_LABELS[data.mood_level] ?? '기분 보통',
    };
  }

  async getToday(userId: string) {
    const date = todayKstDateString();
    const { data } = await this.supabase.admin
      .from('mood_logs')
      .select('mood_level')
      .eq('user_id', userId)
      .eq('log_date', date)
      .maybeSingle();
    if (!data) return null;
    return {
      level: data.mood_level,
      label: MOOD_LABELS[data.mood_level] ?? '기분 보통',
    };
  }
}
