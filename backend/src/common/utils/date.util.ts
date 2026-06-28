export function todayKstDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
}

export function calcAge(birthYear: number | null): number | null {
  if (!birthYear) return null;
  const year = new Date().getFullYear();
  return year - birthYear;
}
