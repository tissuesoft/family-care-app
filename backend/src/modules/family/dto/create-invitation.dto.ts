import { IsUUID } from 'class-validator';

export class CreateInvitationDto {
  @IsUUID()
  family_group_id!: string;
}
