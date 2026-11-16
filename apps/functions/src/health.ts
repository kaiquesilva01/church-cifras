export type HealthStatus = {
  status: 'ok';
  service: 'church-cifras';
  time: string;
};

export function buildHealth(now: Date): HealthStatus {
  return { status: 'ok', service: 'church-cifras', time: now.toISOString() };
}
