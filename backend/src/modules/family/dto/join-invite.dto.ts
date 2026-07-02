import { IsOptional, IsString } from 'class-validator';

export class JoinInviteDto {
  @IsString()
  invite_code!: string;

  @IsString()
  relationship_label!: string;

  @IsOptional()
  @IsString()
  member_role?: string;
}
