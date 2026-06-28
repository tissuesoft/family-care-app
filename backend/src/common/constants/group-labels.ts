export type GroupType = 'family' | 'couple' | 'friends';

export const DEFAULT_GROUP_LABELS: Record<GroupType, string> = {
  family: '우리 가족',
  couple: '나와 아내',
  friends: '친구들',
};

export function resolveTabLabel(
  groupType: GroupType,
  name: string | null,
): string {
  return name?.trim() || DEFAULT_GROUP_LABELS[groupType];
}
