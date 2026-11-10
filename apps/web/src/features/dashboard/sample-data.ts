/**
 * SAMPLE DATA ONLY. These numbers exist so the dashboard design can be reviewed before the
 * backend is connected. The dashboard page shows a visible "Sample data" notice while it uses them.
 * Phase 4 replaces this file with real API data (React Query) and the notice is removed.
 */
export const sampleStats = {
  students: { value: 2580, trend: 12, spark: [20, 24, 23, 29, 31, 30, 38, 44] },
  teachers: { value: 185, trend: 5, spark: [10, 12, 11, 14, 13, 17, 19, 22] },
  fees: { value: 4_850_000, trend: 15, spark: [8, 11, 10, 15, 18, 17, 26, 32] },
  attendance: { value: 96.5, trend: 1.2, spark: [30, 28, 33, 31, 36, 35, 40, 44] },
} as const;

export const samplePerformance = {
  results: [45, 66, 69, 80, 90, 98],
  attendance: [32, 50, 55, 62, 72, 78],
  fees: [20, 37, 42, 45, 55, 61],
} as const;

export const sampleTopClasses = [
  { name: '10-A', score: 98.5, color: '#10B981' },
  { name: '9-B', score: 97.8, color: '#2F62E8' },
  { name: '8-A', score: 96.7, color: '#7C3AED' },
  { name: '7-B', score: 95.9, color: '#F97316' },
] as const;

export const sampleFees = { collected: 4_850_000, pending: 1_380_000 } as const;

export const sampleActivities = [
  { key: 'admission', minutesAgo: 2, name: 'Ayesha Khan' },
  { key: 'payment', minutesAgo: 5, name: 'Muhammad Ali', amount: 25_000 },
  { key: 'attendance', minutesAgo: 10, className: '10-B' },
  { key: 'notice', minutesAgo: 15 },
] as const;

/** daysFromNow keeps the sample events in the future whenever the page is opened. */
export const sampleEvents = [
  { key: 'ptm', daysFromNow: 3, time: '09:00 – 12:00' },
  { key: 'sports', daysFromNow: 7, time: '08:00 – 17:00' },
  { key: 'winter', daysFromNow: 14, time: null },
] as const;
