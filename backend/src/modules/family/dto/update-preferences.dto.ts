import { IsUUID } from 'class-validator';

export class UpdatePreferencesDto {
  @IsUUID()
  last_active_group_id!: string;
}
