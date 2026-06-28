import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { todayKstDateString } from '../../common/utils/date.util';
import { FamilyService } from '../family/family.service';

const MOOD_LABELS: Record<number, string> = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '기분 보통',
  4: '기분 좋음',
  5: '매우 좋음',
};

@Injectable()
export class HomeService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly familyService: FamilyService,
  ) {}

  async getDashboard(userId: string, groupId?: string) {
    const activeGroupId = await this.familyService.resolveActiveGroupId(
      userId,
      groupId,
    );
    await this.familyService.setLastActiveGroupId(userId, activeGroupId);

    const date = todayKstDateString();
    const availableGroups = await this.familyService.listMyGroups(
      userId,
      activeGroupId,
    );

    const memberIds = await this.familyService.getGroupMemberUserIds(
      activeGroupId,
    );
    const otherIds = memberIds.filter((id) => id !== userId);
    const members = await Promise.all(
      otherIds.map((id) =>
        this.familyService.buildMemberSnapshot(
          userId,
          id,
          activeGroupId,
          date,
        ),
      ),
    );

    const activeGroup = availableGroups.find((g) => g.id === activeGroupId);

    return {
      active_group_id: activeGroupId,
      available_groups: availableGroups,
      my_health_score: await this.getHealthScore(userId, date),
      my_safety_check: await this.getSafetyCheck(userId, date),
      active_group: {
        group_id: activeGroupId,
        tab_label: activeGroup?.tab_label ?? '',
        view_all_href: `/v1/family/groups/${activeGroupId}/dashboard/today`,
        members,
      },
      my_medications_today: await this.getMedicationsToday(userId, date),
      my_mood_today: await this.getMoodToday(userId, date),
      my_steps_today: await this.getStepsToday(userId, date),
    };
  }

  private async getHealthScore(userId: string, date: string) {
    const { data } = await this.supabase.admin
      .from('daily_health_scores')
      .select('*')
      .eq('user_id', userId)
      .eq('score_date', date)
      .maybeSingle();

    if (!data) {
      return {
        score: 0,
        percent: 0,
        status_label: '보통',
        completed_tasks: await this.completedTasks(userId, date),
      };
    }

    return {
      score: data.total_score,
      percent: data.total_score,
      status_label: data.total_score >= 80 ? '좋음' : '보통',
      completed_tasks: await this.completedTasks(userId, date),
    };
  }

  private async completedTasks(userId: string, date: string) {
    const tasks: string[] = [];
    const { data: safety } = await this.supabase.admin
      .from('safety_checks')
      .select('status')
      .eq('user_id', userId)
      .eq('check_date', date)
      .maybeSingle();
    if (safety?.status === 'completed') tasks.push('safety_check');

    const { data: steps } = await this.supabase.admin
      .from('daily_steps')
      .select('total_steps')
      .eq('user_id', userId)
      .eq('step_date', date)
      .maybeSingle();
    if ((steps?.total_steps ?? 0) > 0) tasks.push('steps');

    const meds = await this.getMedicationsToday(userId, date);
    if (meds.length && meds.every((m) => m.status === 'taken')) {
      tasks.push('medication');
    }
    return tasks;
  }

  private async getSafetyCheck(userId: string, date: string) {
    const { data } = await this.supabase.admin
      .from('safety_checks')
      .select('status, completed_at')
      .eq('user_id', userId)
      .eq('check_date', date)
      .maybeSingle();

    return {
      status: data?.status === 'completed' ? 'completed' : 'waiting',
      completed_at: data?.completed_at ?? null,
      message: '가족들이 확인할 수 있어요',
    };
  }

  private async getMedicationsToday(userId: string, date: string) {
    const { data: meds } = await this.supabase.admin
      .from('medications')
      .select('id, name, scheduled_time')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('scheduled_time');

    const result = [];
    for (const med of meds ?? []) {
      const { data: log } = await this.supabase.admin
        .from('medication_intake_logs')
        .select('status, taken_at')
        .eq('medication_id', med.id)
        .eq('intake_date', date)
        .maybeSingle();

      const status = log?.status ?? 'scheduled';
      result.push({
        name: med.name,
        status,
        taken_at: log?.taken_at
          ? new Date(log.taken_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: 'Asia/Seoul',
            })
          : undefined,
        scheduled_time: med.scheduled_time?.slice(0, 5),
      });
    }
    return result;
  }

  private async getMoodToday(userId: string, date: string) {
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

  private async getStepsToday(userId: string, date: string) {
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('step_daily_goal')
      .eq('id', userId)
      .maybeSingle();
    const goal = profile?.step_daily_goal ?? 10000;

    const { data: today } = await this.supabase.admin
      .from('daily_steps')
      .select('total_steps')
      .eq('user_id', userId)
      .eq('step_date', date)
      .maybeSingle();
    const steps = today?.total_steps ?? 0;

    const weekDates = this.last7Dates(date);
    const weeklyBars = [];
    for (const d of weekDates) {
      const { data: row } = await this.supabase.admin
        .from('daily_steps')
        .select('total_steps')
        .eq('user_id', userId)
        .eq('step_date', d)
        .maybeSingle();
      weeklyBars.push({
        weekday: new Date(d).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase(),
        steps: row?.total_steps ?? 0,
      });
    }

    return {
      steps,
      goal,
      remaining: Math.max(goal - steps, 0),
      weekly_bars: weeklyBars,
    };
  }

  private last7Dates(endDate: string): string[] {
    const dates: string[] = [];
    const end = new Date(endDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }
}
