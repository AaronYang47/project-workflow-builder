import { expect, test } from "playwright/test";
import { checkAuthRateLimit } from "../functions/api/auth/_rate-limit";

test("repeated login and registration attempts are limited without storing raw identifiers", async () => {
  const counters = new Map<string, { windowStart: number; attempts: number }>();
  const env = {
    SESSION_SECRET: "test-secret",
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...input: unknown[]) { values = input; return this; },
          async run() {
            if (sql.includes("INSERT INTO auth_rate_limits")) {
              const [key, windowStart] = values as [string, number];
              const old = counters.get(key);
              counters.set(key, { windowStart, attempts: old?.windowStart === windowStart ? old.attempts + 1 : 1 });
            }
          },
          async first() { return counters.get(values[0] as string) || null; },
        };
      },
    },
  };
  const request = new Request("https://example.com/api/auth/login", { headers: { "cf-connecting-ip": "192.0.2.1" } });
  for (let index = 0; index < 8; index++) {
    expect(await checkAuthRateLimit(request, env as never, "login", "person@example.com")).toBeNull();
  }
  const limited = await checkAuthRateLimit(request, env as never, "login", "person@example.com");
  expect(limited?.status).toBe(429);
  expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(await checkAuthRateLimit(request, env as never, "login", "other@example.com")).toBeNull();
  for (let index = 0; index < 5; index++) {
    expect(await checkAuthRateLimit(request, env as never, "register", "new@example.com")).toBeNull();
  }
  expect((await checkAuthRateLimit(request, env as never, "register", "new@example.com"))?.status).toBe(429);
  expect([...counters.keys()].every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
});
