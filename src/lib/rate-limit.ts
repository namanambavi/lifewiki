// Simple in-memory rate limiter. One generation per IP per hour.
// For production, use Redis or a database.

const generations = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_GENERATIONS = 2; // max 2 per hour per IP

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = generations.get(ip);

  if (!record || now > record.resetAt) {
    generations.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= MAX_GENERATIONS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}
