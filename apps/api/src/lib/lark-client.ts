/**
 * Lark API client — raw fetch (Workers-compatible).
 *
 * Architecture rule #7: ONLY send operational fields to Lark.
 * Never include diagnosis details, treatment notes, or patient clinical data.
 *
 * Multi-tenant: token cache is keyed by appId+appSecret so two clinics with
 * different Lark apps do NOT share tokens. (Previously this was a module-level
 * singleton — that was a security bug fixed here.)
 *
 * If credentials are missing, callers should use lark-mock.ts instead.
 */

const LARK_BASE = "https://open.larksuite.com/open-apis";

interface TokenCache {
  token: string;
  expiresAt: number;
}

/**
 * Per-appId token cache. Keyed by `${appId}::${appSecret}` to avoid any
 * cross-tenant token bleed. In Workers, module state can be shared across
 * requests in the same isolate, so this Map must be scoped by credentials.
 */
const tokenCache = new Map<string, TokenCache>();

function cacheKey(appId: string, appSecret: string): string {
  return `${appId}::${appSecret}`;
}

async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  const key = cacheKey(appId, appSecret);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - 300_000 > Date.now()) {
    return cached.token;
  }
  const res = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!res.ok) throw new Error(`Lark auth failed: ${res.status}`);
  const data = (await res.json()) as {
    tenant_access_token?: string;
    expire?: number;
    code?: number;
    msg?: string;
  };
  if (!data.tenant_access_token) {
    throw new Error(`Lark auth error: ${data.code} ${data.msg}`);
  }
  tokenCache.set(key, {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire ?? 7200) * 1000,
  });
  return data.tenant_access_token;
}

export interface LarkTaskInput {
  summary: string; // task title
  description?: string;
  due?: string; // ISO timestamp
}

export interface LarkTaskResult {
  taskId: string;
  url?: string;
}

export async function createLarkTask(
  appId: string,
  appSecret: string,
  input: LarkTaskInput,
): Promise<LarkTaskResult> {
  const token = await getTenantAccessToken(appId, appSecret);
  const res = await fetch(`${LARK_BASE}/task/v2/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      due: input.due ? { timestamp: Math.floor(new Date(input.due).getTime() / 1000) } : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Lark task create failed: ${res.status}`);
  const data = (await res.json()) as {
    data?: { task?: { id: string; url?: string } };
    code?: number;
    msg?: string;
  };
  if (data.code !== 0 || !data.data?.task) {
    throw new Error(`Lark task error: ${data.code} ${data.msg}`);
  }
  return { taskId: data.data.task.id, url: data.data.task.url };
}

export interface LarkCalendarEventInput {
  summary: string;
  description?: string;
  start: string; // ISO timestamp
  end: string; // ISO timestamp
  calendarId?: string;
}

export interface LarkCalendarEventResult {
  eventId: string;
}

export async function createLarkCalendarEvent(
  appId: string,
  appSecret: string,
  input: LarkCalendarEventInput,
): Promise<LarkCalendarEventResult> {
  const token = await getTenantAccessToken(appId, appSecret);
  const calendarId = input.calendarId ?? "primary";
  const res = await fetch(
    `${LARK_BASE}/calendar/v4/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start_time: { timestamp: Math.floor(new Date(input.start).getTime() / 1000) },
        end_time: { timestamp: Math.floor(new Date(input.end).getTime() / 1000) },
      }),
    },
  );
  if (!res.ok) throw new Error(`Lark calendar create failed: ${res.status}`);
  const data = (await res.json()) as {
    data?: { event?: { id: string } };
    code?: number;
    msg?: string;
  };
  if (data.code !== 0 || !data.data?.event) {
    throw new Error(`Lark calendar error: ${data.code} ${data.msg}`);
  }
  return { eventId: data.data.event.id };
}

/** Update an existing Lark calendar event (e.g. after rescheduling). */
export async function updateLarkCalendarEvent(
  appId: string,
  appSecret: string,
  eventId: string,
  input: LarkCalendarEventInput,
): Promise<void> {
  const token = await getTenantAccessToken(appId, appSecret);
  const calendarId = input.calendarId ?? "primary";
  const res = await fetch(
    `${LARK_BASE}/calendar/v4/calendars/${calendarId}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start_time: { timestamp: Math.floor(new Date(input.start).getTime() / 1000) },
        end_time: { timestamp: Math.floor(new Date(input.end).getTime() / 1000) },
      }),
    },
  );
  if (!res.ok) throw new Error(`Lark calendar update failed: ${res.status}`);
  const data = (await res.json()) as { code?: number; msg?: string };
  if (data.code !== 0) {
    throw new Error(`Lark calendar update error: ${data.code} ${data.msg}`);
  }
}

/** Delete a Lark calendar event (e.g. when appointment is cancelled). */
export async function deleteLarkCalendarEvent(
  appId: string,
  appSecret: string,
  eventId: string,
  calendarId = "primary",
): Promise<void> {
  const token = await getTenantAccessToken(appId, appSecret);
  const res = await fetch(
    `${LARK_BASE}/calendar/v4/calendars/${calendarId}/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  // 404 is acceptable — event may already be deleted from Lark side.
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`Lark calendar delete failed: ${res.status}`);
  const data = (await res.json()) as { code?: number; msg?: string };
  if (data.code !== 0) {
    throw new Error(`Lark calendar delete error: ${data.code} ${data.msg}`);
  }
}

/**
 * Test whether the supplied Lark credentials are valid by fetching
 * a tenant_access_token. Returns true on success, false (with error) on failure.
 *
 * Used by the admin "Test connection" button in Clinic Settings.
 */
export async function testLarkCredentials(
  appId: string,
  appSecret: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = (await res.json()) as {
      tenant_access_token?: string;
      expire?: number;
      code?: number;
      msg?: string;
    };
    if (data.tenant_access_token) {
      // Pre-warm the cache so the next real call skips the auth roundtrip.
      tokenCache.set(cacheKey(appId, appSecret), {
        token: data.tenant_access_token,
        expiresAt: Date.now() + (data.expire ?? 7200) * 1000,
      });
      return { ok: true };
    }
    return { ok: false, error: `${data.code ?? "?"} ${data.msg ?? "unknown error"}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}