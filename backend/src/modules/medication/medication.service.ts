import { ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { todayKstDateString } from '../../common/utils/date.util';
import { FamilyService } from '../family/family.service';

@Injectable()
export class MedicationService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly familyService: FamilyService,
  ) {}

  async list(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('medications')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('scheduled_time');
    if (error) throw error;
    return data;
  }

  async create(
    userId: string,
    body: {
      name: string;
      dosage_text?: string;
      meal_time: 'morning' | 'lunch' | 'evening';
      scheduled_time: string;
    },
  ) {
    const { data, error } = await this.supabase.admin
      .from('medications')
      .insert({ user_id: userId, ...body })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async logIntake(
    userId: string,
    body: {
      medication_id: string;
      intake_date: string;
      status: 'taken' | 'missed' | 'pending' | 'scheduled';
      taken_at?: string;
    },
  ) {
    const { data: med } = await this.supabase.admin
      .from('medications')
      .select('user_id')
      .eq('id', body.medication_id)
      .single();
    if (!med || med.user_id !== userId) {
      throw new ForbiddenException('Medication not found');
    }
    const { data, error } = await this.supabase.admin
      .from('medication_intake_logs')
      .upsert(
        {
          medication_id: body.medication_id,
          intake_date: body.intake_date,
          status: body.status,
          taken_at: body.taken_at ?? null,
        },
        { onConflict: 'medication_id,intake_date' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async familyStatus(viewerId: string, groupId: string) {
    await this.familyService.assertMember(viewerId, groupId);
    const date = todayKstDateString();
    const memberIds = await this.familyService.getGroupMemberUserIds(groupId);
    const members = await Promise.all(
      memberIds
        .filter((id) => id !== viewerId)
        .map((id) =>
          this.familyService.buildMemberSnapshot(viewerId, id, groupId, date),
        ),
    );
    const missed = members.filter((m) =>
      m.medications.some((med) => med.status === 'missed'),
    ).length;
    const completed = members.length - missed;
    return { summary: { completed_count: completed, missed_count: missed }, members };
  }
}
