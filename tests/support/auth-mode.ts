import { existsSync, readFileSync } from "node:fs";

/**
 * True when the dev server signs every browser in as the local developer
 * (NEXT_PUBLIC_AUTH_BYPASS=1 in .env.local). Cloud saving and account
 * switching are switched off in that mode by design, so tests of those flows
 * need a server started without the bypass.
 */
export function authBypassEnabled() {
  if (process.env.NEXT_PUBLIC_AUTH_BYPASS) return process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";
  for (const file of [".env.local", ".env.development.local", ".env.development", ".env"]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(
      /^\s*NEXT_PUBLIC_AUTH_BYPASS\s*=\s*"?([^"\s]*)"?/m,
    );
    if (match) return match[1] === "1";
  }
  return false;
}

export const NEEDS_REAL_AUTH =
  "Needs a dev server without NEXT_PUBLIC_AUTH_BYPASS=1 (real sign-in and cloud API).";
