export type Counter = { name: string; value: number };

export function increment(counters: Counter[], name: string, by = 1): Counter[] {
  const existing = counters.find((c) => c.name === name);
  if (existing === undefined) {
    return [...counters, { name, value: by }];
  }
  return counters.map((c) => (c.name === name ? { name, value: c.value + by } : c));
}

export function total(counters: Counter[]): number {
  return counters.reduce((sum, c) => sum + c.value, 0);
}
