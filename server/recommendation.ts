import type { Prediction, Recommendation, Settings } from '../shared/types.ts';
export const timeLabel = (time: string | number, timezone: string) => new Intl.DateTimeFormat('en-US', {timeZone:timezone, hour:'numeric',minute:'2-digit'}).format(new Date(time));
export function validateSeries(series: Prediction[]) {
  if (!Array.isArray(series) || !series.length || series.some(p => !p || !Number.isFinite(Date.parse(p.departure)) || !Number.isFinite(p.minutes) || p.minutes <= 0 || !Number.isFinite(p.delayMinutes) || p.delayMinutes < 0)) throw new Error('Missing or malformed travel predictions.');
  return [...series].sort((a,b)=>Date.parse(a.departure)-Date.parse(b.departure));
}
export function trafficTrend(series: Prediction[], timezone: string) {
  const points = validateSeries(series), first = points[0].minutes;
  // A meaningful later excursion matters even if traffic subsequently recovers.
  const change = points.find(p => Math.abs(p.minutes-first) >= 3);
  const trend = change ? (change.minutes > first ? 'worsening' : 'improving') : 'stable';
  return { trend, changeAt: change?.departure || null,
    trendMessage: change ? `Traffic is expected to ${trend === 'worsening' ? 'worsen' : 'improve'} around ${timeLabel(change.departure,timezone)}.` : 'Traffic is expected to stay steady.' } as const;
}
export function recommend(s: Settings, series: Prediction[], current: Prediction, now: number): Recommendation {
  const points = validateSeries(series); validateSeries([current]);
  const extra = s.parkingWalkingMinutes + s.safetyBufferMinutes;
  const deadline = Date.parse(s.arriveBy);
  let latest: {time:number; minutes:number; delay:number} | null = null;
  const consider = (time:number, minutes:number, delay:number) => {
    if (time >= now && time + (minutes+extra)*60000 <= deadline && (!latest || time > latest.time)) latest = {time,minutes,delay};
  };
  // Conservative interpolation: use the slower endpoint, and never extrapolate.
  for (let i=0;i<points.length;i++) {
    const p=points[i], start=Date.parse(p.departure);
    consider(start,p.minutes,p.delayMinutes);
    const next=points[i+1];
    if (next && Date.parse(next.departure)-start<=11*60000) for (let t=Math.ceil(start/60000)*60000;t<Date.parse(next.departure);t+=60000) consider(t,Math.max(p.minutes,next.minutes),Math.max(p.delayMinutes,next.delayMinutes));
  }
  consider(now,current.minutes,current.delayMinutes);
  const best = latest as {time:number; minutes:number; delay:number} | null;
  const trend = trafficTrend(points,s.timezone);
  const leaveBy = best ? new Date(Math.floor(best.time/60000)*60000).toISOString() : null;
  return { leaveBy, feasible:!!best, currentTravelMinutes:Math.ceil(current.minutes), predictedTravelMinutes:Math.ceil(best?.minutes ?? current.minutes),
    parkingWalkingMinutes:s.parkingWalkingMinutes, safetyBufferMinutes:s.safetyBufferMinutes, trafficDelayMinutes:Math.ceil(current.delayMinutes), ...trend,
    message:best ? `${best.time-now < 60000 ? 'Leave now' : `Leave by ${timeLabel(leaveBy!,s.timezone)}`}. ${trend.trendMessage}` : 'Leave now. The requested arrival is no longer achievable with your allowances.' };
}
