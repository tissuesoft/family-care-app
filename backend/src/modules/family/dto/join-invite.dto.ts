import { IsIn, IsOptional, IsString } from 'class-validator';

export class JoinInviteDto {
  @IsString()
  invite_code!: string;

  @IsString()
  relationship_label!: string;

  @IsOptional()
  @IsIn(['parent', 'caregiver'])
  member_role?: 'parent' | 'caregiver';
}
