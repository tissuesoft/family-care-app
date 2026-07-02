import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { calcAge, todayKstDateString } from '../../common/utils/date.util';

const MOOD_LABELS: Record<number, string> = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '기분 보통',
  4: '기분 좋음',
  5: '매우 좋음',
};

@Injectable()
export class FamilyService {
  constructor(private readonly supabase: SupabaseService) {}

  async listMyGroups(userId: string, activeGroupId?: string) {
    const { data: memberships, error } = await this.supabase.admin
      .from('family_group_members')
      .select('family_group_id')
      .eq('user_id', userId);

    if (error) throw error;
    const groupIds = [...new Set((memberships ?? []).map((m) => m.family_group_id))];
    if (!groupIds.length) return [];

    const { data: groups, error: gErr } = await this.supabase.admin
      .from('family_groups')
      .select('id, name')
      .in('id', groupIds);
    if (gErr) throw gErr;

    const result = await Promise.all(
      (groups ?? []).map(async (g) => {
        const { count } = await this.supabase.admin
          .from('family_group_members')
          .select('*', { count: 'exact', head: true })
          .eq('family_group_id', g.id);
        return {
          id: g.id,
          name: g.name,
          member_count: count ?? 0,
          is_active: g.id === activeGroupId,
        };
      }),
    );
    return result;
  }

  async getLastActiveGroupId(userId: string): Promise<string | null> {
    const { data } = await this.supabase.admin
      .from('user_preferences')
      .select('last_active_group_id')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.last_active_group_id ?? null;
  }

  async setLastActiveGroupId(userId: string, groupId: string) {
    await this.supabase.admin.from('user_preferences').upsert({
      user_id: userId,
      last_active_group_id: groupId,
      updated_at: new Date().toISOString(),
    });
  }

  async resolveActiveGroupId(userId: string, groupId?: string): Promise<string> {
    if (groupId) {
      await this.assertMember(userId, groupId);
      return groupId;
    }
    const last = await this.getLastActiveGroupId(userId);
    if (last) {
      await this.assertMember(userId, last);
      return last;
    }
    const groups = await this.listMyGroups(userId);
    if (!groups.length) {
      throw new BadRequestException({
        code: 'GROUP_ID_REQUIRED',
        message: '가족 그룹에 소속되어 있지 않습니다.',
      });
    }
    const picked = groups.sort((a, b) => b.member_count - a.member_count)[0];
    return picked.id;
  }

  async assertMember(userId: string, groupId: string) {
    const { data, error } = await this.supabase.admin
      .from('family_group_members')
      .select('id')
      .eq('family_group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new ForbiddenException({
        code: 'NOT_GROUP_MEMBER',
        message: '해당 그룹의 멤버가 아닙니다.',
      });
    }
  }

  async getGroupMemberUserIds(groupId: string): Promise<string[]> {
    const { data, error } = await this.supabase.admin
      .from('family_group_members')
      .select('user_id')
      .eq('family_group_id', groupId);
    if (error) throw error;
    return (data ?? []).map((r) => r.user_id);
  }

  async buildMemberSnapshot(
    viewerId: string,
    memberUserId: string,
    groupId: string,
    date: string,
  ) {
    await this.assertMember(viewerId, groupId);
    const { data: membership, error: mErr } = await this.supabase.admin
      .from('family_group_members')
      .select('relationship_label')
      .eq('family_group_id', groupId)
      .eq('user_id', memberUserId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!membership) {
      throw new ForbiddenException({
        code: 'TARGET_NOT_IN_GROUP',
        message: '대상이 이 그룹에 없습니다.',
      });
    }

    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('display_name, birth_year')
      .eq('id', memberUserId)
      .maybeSingle();

    const { data: safety } = await this.supabase.admin
      .from('safety_checks')
      .select('status, completed_at')
      .eq('user_id', memberUserId)
      .eq('check_date', date)
      .maybeSingle();

    const { data: steps } = await this.supabase.admin
      .from('daily_steps')
      .select('total_steps')
      .eq('user_id', memberUserId)
      .eq('step_date', date)
      .maybeSingle();

    const { data: mood } = await this.supabase.admin
      .from('mood_logs')
      .select('mood_level')
      .eq('user_id', memberUserId)
      .eq('log_date', date)
      .maybeSingle();

    const { data: meds } = await this.supabase.admin
      .from('medications')
      .select('id, name')
      .eq('user_id', memberUserId)
      .eq('is_active', true);

    const medStatuses: { name: string; status: string }[] = [];
    for (const med of meds ?? []) {
      const { data: log } = await this.supabase.admin
        .from('medication_intake_logs')
        .select('status')
        .eq('medication_id', med.id)
        .eq('intake_date', date)
        .maybeSingle();
      const status = log?.status ?? 'scheduled';
      medStatuses.push({
        name: med.name,
        status: status === 'taken' ? 'taken' : status === 'missed' ? 'missed' : 'scheduled',
      });
    }

    const safetyStatus =
      safety?.status === 'completed' ? 'completed' : 'waiting';

    return {
      user_id: memberUserId,
      relationship_label: membership.relationship_label,
      display_name: profile?.display_name ?? '사용자',
      age: calcAge(profile?.birth_year ?? null),
      safety_check_status: safetyStatus,
      steps: steps?.total_steps ?? 0,
      medications: medStatuses,
      mood_label: mood ? MOOD_LABELS[mood.mood_level] ?? '기분 보통' : null,
      last_updated_at: safety?.completed_at ?? null,
    };
  }

  async getDashboardToday(userId: string, groupId: string) {
    await this.assertMember(userId, groupId);
    const date = todayKstDateString();
    const memberIds = await this.getGroupMemberUserIds(groupId);
    const others = memberIds.filter((id) => id !== userId);

    const members = await Promise.all(
      others.map((id) => this.buildMemberSnapshot(userId, id, groupId, date)),
    );

    const safetyCompleted = members.filter(
      (m) => m.safety_check_status === 'completed',
    ).length;
    const totalMembers = memberIds.length;
    const avgSteps =
      members.length > 0
        ? Math.round(
            members.reduce((s, m) => s + (m.steps ?? 0), 0) / members.length,
          )
        : 0;

    const groups = await this.listMyGroups(userId, groupId);
    const active = groups.find((g) => g.id === groupId);

    return {
      group_id: groupId,
      name: active?.name ?? '',
      available_groups: groups,
      summary: {
        total_members: totalMembers,
        safety_completed_count: safetyCompleted,
        safety_completion_percent: totalMembers
          ? Math.round((safetyCompleted / totalMembers) * 100)
          : 0,
        avg_steps: avgSteps,
        medication_summary: {
          completed_members: members.filter((m) =>
            m.medications.every((med) => med.status === 'taken' || med.status === 'scheduled'),
          ).length,
          total_with_meds: members.filter((m) => m.medications.length > 0).length,
        },
      },
      members,
    };
  }

  async createGroup(
    userId: string,
    name: string,
    relationshipLabel = '나',
  ) {
    const { data: group, error } = await this.supabase.admin
      .from('family_groups')
      .insert({
        name: name.trim(),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    await this.supabase.admin.from('family_group_members').insert({
      family_group_id: group.id,
      user_id: userId,
      relationship_label: relationshipLabel,
      member_role: 'caregiver',
    });

    await this.setLastActiveGroupId(userId, group.id);
    return group;
  }

  async createInvitation(userId: string, familyGroupId: string) {
    await this.assertMember(userId, familyGroupId);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await this.supabase.admin
      .from('family_invitations')
      .insert({
        family_group_id: familyGroupId,
        invite_code: code,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      invite_code: data.invite_code,
      invite_link: `family-care://invite?code=${data.invite_code}`,
    };
  }

  async joinByInviteCode(
    userId: string,
    inviteCode: string,
    relationshipLabel: string,
    memberRole?: string,
  ) {
    const { data: invite, error } = await this.supabase.admin
      .from('family_invitations')
      .select('*')
      .eq('invite_code', inviteCode)
      .is('accepted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!invite) throw new NotFoundException('유효하지 않은 초대 코드입니다.');

    await this.supabase.admin.from('family_group_members').upsert(
      {
        family_group_id: invite.family_group_id,
        user_id: userId,
        relationship_label: relationshipLabel,
        member_role: memberRole ?? null,
      },
      { onConflict: 'family_group_id,user_id' },
    );

    await this.supabase.admin
      .from('family_invitations')
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq('id', invite.id);

    await this.setLastActiveGroupId(userId, invite.family_group_id);
    return { family_group_id: invite.family_group_id };
  }
}
