import type { Equipment } from '@equipdemo/contracts';

/**
 * Workforce view-model: what field staff see first. Pure functions, so they are
 * testable without a device and reusable by whichever native shell is chosen.
 */
export type FleetSummary = {
  count: number;
  /** Combined hourly rate of the whole fleet, rounded to 2 decimals. */
  totalHourlyRate: number;
  mostExpensive: Equipment | null;
  /** Items at or above the premium threshold need a supervisor sign-off before dispatch. */
  needsSignOff: Equipment[];
};

export const PREMIUM_THRESHOLD = 1500;

export function summarizeFleet(items: readonly Equipment[], premiumThreshold = PREMIUM_THRESHOLD): FleetSummary {
  const total = items.reduce((sum, item) => sum + item.price_per_hour, 0);
  const mostExpensive = items.reduce<Equipment | null>(
    (best, item) => (best === null || item.price_per_hour > best.price_per_hour ? item : best),
    null,
  );
  return {
    count: items.length,
    totalHourlyRate: Math.round(total * 100) / 100,
    mostExpensive,
    needsSignOff: items.filter(item => item.price_per_hour >= premiumThreshold).sort((a, b) => b.price_per_hour - a.price_per_hour),
  };
}
