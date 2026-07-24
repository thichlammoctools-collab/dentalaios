import { api, apiDelete, apiGet, apiPatch, apiPost } from "./api";

/** Internal referral endpoints always use the clinic workspace session. */
export const referrersApi = {
  list: <T>() => apiGet<T>("/api/referrers"),
  search: <T>(query: string) => apiGet<T>(`/api/referrers/search?q=${encodeURIComponent(query)}`),
  lookupById: <T>(id: string) => apiGet<T>(`/api/referrers/lookup-id/${encodeURIComponent(id)}`),
  quickCreate: <T>(body: unknown) => apiPost<T>("/api/referrers/quick", body),
  create: <T>(body: unknown) => apiPost<T>("/api/referrers", body),
  update: <T>(id: string, body: unknown) => apiPatch<T>(`/api/referrers/${encodeURIComponent(id)}`, body),
  remove: <T>(id: string) => apiDelete<T>(`/api/referrers/${encodeURIComponent(id)}`),
  regenerateCode: <T>(id: string) => apiPost<T>(`/api/referrers/${encodeURIComponent(id)}/regenerate-code`),
  createAccount: <T>(id: string, body: unknown) => apiPost<T>(`/api/referrers/${encodeURIComponent(id)}/account`, body),
  updateAccount: <T>(id: string, body: unknown) => apiPatch<T>(`/api/referrers/${encodeURIComponent(id)}/account`, body),
  resetAccount: <T>(id: string) => apiPost<T>(`/api/referrers/${encodeURIComponent(id)}/account/reset-password`),
};

export const referralProgramsApi = {
  list: <T>() => apiGet<T>("/api/referral-programs"),
  create: <T>(body: unknown) => apiPost<T>("/api/referral-programs", body),
  updateStatus: <T>(id: string, status: string) => apiPatch<T>(`/api/referral-programs/${encodeURIComponent(id)}`, { status }),
};

export const referralsApi = {
  cases: <T>(query = "") => apiGet<T>(`/api/referrals${query}`),
  rewards: <T>(query = "") => apiGet<T>(`/api/referrals/rewards${query}`),
  reviewReward: <T>(id: string, body: unknown) => apiPost<T>(`/api/referrals/rewards/${encodeURIComponent(id)}/review`, body),
  markPaid: <T>(id: string, body: unknown) => apiPost<T>(`/api/referrals/rewards/${encodeURIComponent(id)}/mark-paid`, body),
  issueVoucher: <T>(id: string) => apiPost<T>(`/api/referrals/rewards/${encodeURIComponent(id)}/issue-voucher`),
  recover: <T>(id: string, body: unknown) => apiPost<T>(`/api/referrals/rewards/${encodeURIComponent(id)}/recover`, body),
  reopen: <T>(id: string, body: unknown) => apiPost<T>(`/api/referrals/rewards/${encodeURIComponent(id)}/reopen`, body),
};

export const referralReportsApi = {
  get: <T>(query = "") => apiGet<T>(`/api/referral-reports${query}`),
  exportCsv: (query = "") => api(`/api/referral-reports/export.csv${query}`, { method: "GET" }),
};
