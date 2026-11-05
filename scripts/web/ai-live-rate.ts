export function aiRateWindowWaitMs(createdAt: string[], now = Date.now(), limit = 2, windowMs = 60_000): number {
  const recent = createdAt.map(Date.parse).filter(value => Number.isFinite(value) && value >= now - windowMs).sort((left, right) => left - right);
  if (recent.length < limit) return 0;
  return Math.max(0, recent[0] + windowMs + 1_000 - now);
}
