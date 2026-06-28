import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { GroupType } from '../../common/constants/group-labels';
import { FamilyService } from './family.service';

@Controller('v1/family')
@UseGuards(SupabaseAuthGuard)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Get('groups')
  listGroups(@CurrentUser() user: User) {
    return this.familyService.listMyGroups(user.id);
  }

  @Post('groups')
  createGroup(
    @CurrentUser() user: User,
    @Body() body: { group_type: GroupType; name?: string; relationship_label?: string },
  ) {
    return this.familyService.createGroup(
      user.id,
      body.group_type,
      body.name,
      body.relationship_label,
    );
  }

  @Get('groups/:groupId/dashboard/today')
  dashboardToday(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
  ) {
    return this.familyService.getDashboardToday(user.id, groupId);
  }

  @Post('invitations')
  createInvitation(
    @CurrentUser() user: User,
    @Body() body: { family_group_id: string },
  ) {
    return this.familyService.createInvitation(user.id, body.family_group_id);
  }

  @Post('invitations/join')
  joinInvitation(
    @CurrentUser() user: User,
    @Body()
    body: {
      invite_code: string;
      relationship_label: string;
      member_role?: 'parent' | 'caregiver';
    },
  ) {
    return this.familyService.joinByInviteCode(
      user.id,
      body.invite_code,
      body.relationship_label,
      body.member_role,
    );
  }
}

@Controller('v1/user')
@UseGuards(SupabaseAuthGuard)
export class UserPreferencesController {
  constructor(private readonly familyService: FamilyService) {}

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() body: { last_active_group_id: string },
  ) {
    await this.familyService.assertMember(user.id, body.last_active_group_id);
    await this.familyService.setLastActiveGroupId(
      user.id,
      body.last_active_group_id,
    );
    return { last_active_group_id: body.last_active_group_id };
  }
}
