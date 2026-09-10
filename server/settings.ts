import type { Settings } from '../shared/types.ts';
export function defaults(): Settings {
  return { origin: '', destination: '', arriveBy: '', timezone: 'America/Los_Angeles',
    safetyBufferMinutes: 5, parkingWalkingMinutes: 0, activeWeekdays: [1,2,3,4,5],
    activeStart: '06:00', activeEnd: '10:00', brightness: 0.3, rotateScreens: true };
}
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter valid commute settings.');
  const s = input as Settings;
  for (const key of ['origin', 'destination'] as const) {
    if (typeof s[key] !== 'string' || !s[key].trim() || s[key].length > 240) throw new Error('Enter an origin and destination of 240 characters or fewer.');
  }
  if (typeof s.arriveBy !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(s.arriveBy) || !Number.isFinite(Date.parse(s.arriveBy))) throw new Error('Choose an arrival date and time with a timezone.');
  if (typeof s.timezone !== 'string' || s.timezone.length > 80) throw new Error('Choose a valid timezone.');
  try { new Intl.DateTimeFormat('en', { timeZone: s.timezone }).format(); } catch { throw new Error('Choose a valid timezone.'); }
  for (const key of ['safetyBufferMinutes', 'parkingWalkingMinutes'] as const) {
    if (!Number.isInteger(s[key]) || s[key] < 0 || s[key] > 120) throw new Error('Allowances must be whole minutes between 0 and 120.');
  }
  if (!Array.isArray(s.activeWeekdays) || s.activeWeekdays.length > 7 || !s.activeWeekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) throw new Error('Choose valid weekdays.');
  for (const key of ['activeStart','activeEnd'] as const) if (typeof s[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s[key])) throw new Error('Choose a valid active time window.');
  if (typeof s.brightness !== 'number' || !Number.isFinite(s.brightness) || s.brightness < 0.05 || s.brightness > 1 || typeof s.rotateScreens !== 'boolean') throw new Error('Invalid display settings.');
  return { origin:s.origin.trim(), destination:s.destination.trim(), arriveBy:new Date(s.arriveBy).toISOString(), timezone:s.timezone,
    safetyBufferMinutes:s.safetyBufferMinutes, parkingWalkingMinutes:s.parkingWalkingMinutes,
    activeWeekdays:[...new Set(s.activeWeekdays)], activeStart:s.activeStart, activeEnd:s.activeEnd, brightness:s.brightness, rotateScreens:s.rotateScreens };
}
export function activeNow(s: Settings, now: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:s.timezone, weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(now);
  const value = (key: string) => parts.find(p=>p.type===key)?.value || '';
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(value('weekday'));
  const t = `${value('hour')}:${value('minute')}`;
  if (s.activeStart === s.activeEnd) return s.activeWeekdays.includes(day);
  if (s.activeStart < s.activeEnd) return s.activeWeekdays.includes(day) && t >= s.activeStart && t < s.activeEnd;
  return (t >= s.activeStart && s.activeWeekdays.includes(day)) || (t < s.activeEnd && s.activeWeekdays.includes((day+6)%7));
}
export const settingsKey = (s: Settings) => JSON.stringify([s.origin,s.destination,s.arriveBy,s.timezone,s.safetyBufferMinutes,s.parkingWalkingMinutes]);
