/**
 * Lark API client — raw fetch (Workers-compatible).
 *
 * Architecture rule #7: ONLY send operational fields to Lark.
 * Never include diagnosis details, treatment notes, or patient clinical data.
 *
 * If credentials are missing, callers should use lark-mock.ts instead.
 */

const LARK_BASE = "https://open.larksuite.com/open-apis";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  // Reuse cached token if still valid (5 min safety margin)
  if (cachedToken && cachedToken.expiresAt - 300_000 > Date.now()) {
    return cachedToken.token;
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
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire ?? 7200) * 1000,
  };
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