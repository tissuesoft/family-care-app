import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { todayKstDateString } from '../../common/utils/date.util';
import { FamilyService } from '../family/family.service';

@Injectable()
export class StepsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly familyService: FamilyService,
  ) {}

  async sync(
    userId: string,
    body: {
      step_date: string;
      total_steps: number;
      calories_kcal?: number;
      distance_km?: number;
      duration_minutes?: number;
      hourly?: { recorded_at: string; steps: number }[];
    },
  ) {
    const { data, error } = await this.supabase.admin
      .from('daily_steps')
      .upsert(
        {
          user_id: userId,
          step_date: body.step_date,
          total_steps: body.total_steps,
          calories_kcal: body.calories_kcal ?? null,
          distance_km: body.distance_km ?? null,
          duration_minutes: body.duration_minutes ?? null,
        },
        { onConflict: 'user_id,step_date' },
      )
      .select()
      .single();
    if (error) throw error;

    if (body.hourly?.length) {
      await this.supabase.admin
        .from('hourly_step_counts')
        .delete()
        .eq('user_id', userId)
        .gte('recorded_at', `${body.step_date}T00:00:00+09:00`)
        .lte('recorded_at', `${body.step_date}T23:59:59+09:00`);
      await this.supabase.admin.from('hourly_step_counts').insert(
        body.hourly.map((h) => ({
          user_id: userId,
          recorded_at: h.recorded_at,
          steps: h.steps,
        })),
      );
    }
    return data;
  }

  async familyToday(viewerId: string, groupId: string) {
    await this.familyService.assertMember(viewerId, groupId);
    const date = todayKstDateString();
    const memberIds = await this.familyService.getGroupMemberUserIds(groupId);
    const rows = await Promise.all(
      memberIds.map(async (id) => {
        const { data: membership } = await this.supabase.admin
          .from('family_group_members')
          .select('relationship_label')
          .eq('family_group_id', groupId)
          .eq('user_id', id)
          .maybeSingle();
        const { data: steps } = await this.supabase.admin
          .from('daily_steps')
          .select('total_steps')
          .eq('user_id', id)
          .eq('step_date', date)
          .maybeSingle();
        return {
          user_id: id,
          relationship_label: membership?.relationship_label ?? '나',
          steps: steps?.total_steps ?? 0,
        };
      }),
    );
    return rows;
  }
}
