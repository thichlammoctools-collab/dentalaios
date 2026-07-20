import type { PlatformSession } from "@shared/types";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

let token: string | null = null;

export const PLATFORM_SESSION_EXPIRED_EVENT = "platform-session-expired";

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}

export function setPlatformToken(next: string | null): void {
  token = next;
}

export function getPlatformToken(): string | null {
  return token;
}

export async function platformApi<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      message = body.error ?? message;
      code = body.code;
    } catch {
      // Retain the generic message when the Worker did not return JSON.
    }
    if (response.status === 401) {
      window.dispatchEvent(new Event(PLATFORM_SESSION_EXPIRED_EVENT));
      message = "Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.";
    }
    throw new PlatformApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const platformGet = <T = unknown>(path: string) =>
  platformApi<T>(path, { method: "GET" });

export const platformPost = <T = unknown>(path: string, body?: unknown) =>
  platformApi<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });

export const platformPut = <T = unknown>(path: string, body?: unknown) =>
  platformApi<T>(path, {
    method: "PUT",
    body: JSON.stringify(body ?? {}),
  });

export const platformPatch = <T = unknown>(path: string, body?: unknown) =>
  platformApi<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body ?? {}),
  });

export type PlatformLoginChallenge = {
  mfa_required: true;
  challenge_id: string;
  mfa_enrollment_required?: boolean;
  secret?: string;
  otpauth_uri?: string;
};
export type PlatformMfaResponse = { session: PlatformSession };
