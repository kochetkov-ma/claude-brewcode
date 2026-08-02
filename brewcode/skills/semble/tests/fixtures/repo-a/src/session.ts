export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: number;
}

export function isExpired(session: Session, now: number): boolean {
  return session.expiresAt <= now;
}

export function renew(session: Session, ttlMs: number, now: number): Session {
  return { ...session, expiresAt: now + ttlMs };
}

export const DEFAULT_TTL_MS = 3_600_000;
