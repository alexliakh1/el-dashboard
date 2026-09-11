export type Settings = {
  origin: string; destination: string; arriveBy: string; timezone: string;
  safetyBufferMinutes: number; parkingWalkingMinutes: number;
  activeWeekdays: number[]; activeStart: string; activeEnd: string;
  brightness: number; rotateScreens: boolean; displayMode?: 'drive' | 'eta';
};
export type Prediction = { departure: string; minutes: number; delayMinutes: number };
export type Recommendation = {
  leaveBy: string | null; feasible: boolean; currentTravelMinutes: number;
  predictedTravelMinutes: number; parkingWalkingMinutes: number; safetyBufferMinutes: number;
  trafficDelayMinutes: number; trend: 'improving' | 'stable' | 'worsening';
  trendMessage: string; changeAt: string | null; message: string;
};
export type Snapshot = { settingsKey: string; updatedAt: string; predictionsAt: string;
  current: Prediction; predictions: Prediction[]; recommendation: Recommendation };
export type DisplayPayload = {
  status: string; message?: string; updatedAt?: string; predictionsAt?: string;
  serverEpoch: number; utcOffsetSeconds: number; ageSeconds: number; refreshAfterSeconds: number; staleAfterSeconds?: number;
  active: boolean; route: { origin: string; destination: string; arriveBy: string };
  recommendation?: Recommendation; predictions: (Prediction & { time: string })[];
  display: { brightness: number; rotateScreens: boolean; mode?: 'drive' | 'eta'; etaEpoch?: number; etaUtcOffsetSeconds?: number; leaveTime: string; arriveTime: string; changeTime: string };
};
