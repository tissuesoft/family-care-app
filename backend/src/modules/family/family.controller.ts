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
import { FamilyService } from './family.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JoinInviteDto } from './dto/join-invite.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Controller('v1/family')
@UseGuards(SupabaseAuthGuard)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Get('groups')
  listGroups(@CurrentUser() user: User) {
    return this.familyService.listMyGroups(user.id);
  }

  @Post('groups')
  createGroup(@CurrentUser() user: User, @Body() body: CreateGroupDto) {
    return this.familyService.createGroup(
      user.id,
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
    @Body() body: CreateInvitationDto,
  ) {
    return this.familyService.createInvitation(user.id, body.family_group_id);
  }

  @Post('invitations/join')
  joinInvitation(@CurrentUser() user: User, @Body() body: JoinInviteDto) {
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
    @Body() body: UpdatePreferencesDto,
  ) {
    await this.familyService.assertMember(user.id, body.last_active_group_id);
    await this.familyService.setLastActiveGroupId(
      user.id,
      body.last_active_group_id,
    );
    return { last_active_group_id: body.last_active_group_id };
  }
}
