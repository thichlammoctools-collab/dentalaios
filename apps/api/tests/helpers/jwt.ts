/**
 * Test helper: build a fake Env object with mock D1 + JWT_SECRET.
 */
import type { Env } from "../../src/index";
import type { MockD1 } from "./mock-db";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-prod";

export function buildEnv(db: MockD1, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    FILES: {} as R2Bucket,
    JOBS: {} as Queue,
    ENVIRONMENT: "test",
    FRONTEND_ORIGIN: "http://localhost:5173",
    JWT_SECRET: TEST_JWT_SECRET,
    LARK_APP_ID: undefined,
    LARK_APP_SECRET: undefined,
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    ...overrides,
  };
}

export const TEST_SECRET = TEST_JWT_SECRET;
export const OTHER_SECRET = "different-secret-for-negative-tests";
export const TENANT_A = "tenant-A";
export const TENANT_B = "tenant-B";
export const USER_A = "user-A";
export const USER_B = "user-B";
export const PATIENT_A1 = "patient-A1";
export const PATIENT_B1 = "patient-B1";