import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { FamilyService } from '../family/family.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly familyService: FamilyService,
  ) {}

  async getSettings(userId: string, groupId?: string) {
    const activeGroupId = await this.familyService.resolveActiveGroupId(
      userId,
      groupId,
    );
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('display_name, is_premium')
      .eq('id', userId)
      .single();
    const { data: notif } = await this.supabase.admin
      .from('user_notification_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    const { data: privacy } = await this.supabase.admin
      .from('user_privacy_settings')
      .select('data_type, visibility')
      .eq('user_id', userId);
    const myGroups = await this.familyService.listMyGroups(userId, activeGroupId);
    const { data: members } = await this.supabase.admin
      .from('family_group_members')
      .select('relationship_label, member_role, user_id')
      .eq('family_group_id', activeGroupId);

    return {
      profile,
      my_groups: myGroups,
      family_members: members,
      notification_settings: notif,
      privacy_settings: privacy,
      plan_info: {
        current: profile?.is_premium ? 'premium' : 'free',
        price_krw: 4900,
      },
      app_version: '1.0.0',
    };
  }
}
