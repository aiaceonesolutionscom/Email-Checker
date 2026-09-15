import { DISPOSABLE_DOMAINS, ROLE_PREFIXES } from "./blocklist";
import type { VerifyStatus } from "./types";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const MAX_LOCAL = 64;
const MAX_DOMAIN = 253;

export function checkSyntax(email: string): boolean {
  if (!email || email.length > MAX_LOCAL + 1 + MAX_DOMAIN) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length === 0 || local.length > MAX_LOCAL) return false;
  if (domain.length === 0 || domain.length > MAX_DOMAIN) return false;
  if (domain.startsWith("-") || domain.endsWith("-")) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  return true;
}

export function checkDisposable(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

export function checkRole(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase();
  if (!local) return false;
  return ROLE_PREFIXES.has(local);
}

const BLOCKED_PROVIDERS = new Set([
  "yahoo.com", "yahoo.co.uk", "yahoo.com.au", "yahoo.ca", "yahoo.co.in",
  "ymail.com", "rocketmail.com", "aol.com", "aim.com",
  "hotmail.com", "hotmail.co.uk", "hotmail.com.br", "hotmail.es",
  "hotmail.fr", "hotmail.de", "hotmail.it", "hotmail.in",
  "outlook.com", "outlook.fr", "outlook.de", "outlook.es",
  "outlook.it", "outlook.co.uk", "outlook.in", "outlook.com.br",
  "live.com", "live.co.uk", "live.in", "live.com.au", "live.it",
  "live.de", "live.fr", "msn.com", "office365.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "protonmail.ch", "pm.me",
]);

export function isBlockedProvider(domain?: string | null): boolean {
  if (!domain) return false;
  return BLOCKED_PROVIDERS.has(domain.toLowerCase().trim());
}

export function computeStatus(
  syntax: boolean,
  disposable: boolean,
  role: boolean,
  mx: boolean,
  smtp: VerifyStatus
): { status: VerifyStatus; reason: string } {
  if (!syntax) return { status: "INVALID", reason: "Invalid email syntax" };
  if (disposable) return { status: "INVALID", reason: "Disposable email address" };
  if (role) return { status: "INVALID", reason: "Role-based email address" };
  if (!mx) return { status: "INVALID", reason: "No MX record found for domain" };
  if (smtp === "VALID") return { status: "VALID", reason: "All checks passed" };
  if (smtp === "INVALID") return { status: "INVALID", reason: "Mailbox does not exist (SMTP)" };
  if (smtp === "UNKNOWN") return { status: "UNKNOWN", reason: "SMTP check inconclusive (greylisting/timeout)" };
  return { status: "PENDING", reason: "SMTP check pending" };
}
