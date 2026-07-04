/**
 * Mock D1Database for unit tests.
 *
 * Implements the subset of D1Database API our code uses:
 *   db.prepare(sql).bind(...).first()
 *   db.prepare(sql).bind(...).all()
 *   db.prepare(sql).bind(...).run()
 *
 * Two modes:
 *  - "spy"  (default): captures all (sql, binds) tuples for assertion. Returns null / empty.
 *  - "seed" (seedRows): returns pre-configured rows keyed by SQL fragment.
 *
 * Tests can assert that:
 *  - Every SQL query contains "tenant_id" (tenant isolation)
 *  - tenantId was passed as a bind param
 *  - The right SQL is issued for each operation
 */

export interface CapturedCall {
  sql: string;
  binds: unknown[];
  method: "first" | "all" | "run";
}

export interface MockD1 {
  prepare(sql: string): {
    bind(...binds: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results: T[] }>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
  /** Test helpers — not part of D1Database interface */
  __calls: CapturedCall[];
  __sqlContaining(fragment: string): CapturedCall[];
  __reset(): void;
}

export interface MockD1Options {
  /** Map of SQL fragment → rows to return for first() / all() */
  rowsByFragment?: Map<string, unknown[]>;
  /** Default row for first() when no fragment matches */
  defaultFirst?: unknown;
}

export function createMockD1(options: MockD1Options = {}): MockD1 {
  const calls: CapturedCall[] = [];
  const rowsByFragment = options.rowsByFragment ?? new Map<string, unknown[]>();

  function findRows(sql: string): unknown[] | undefined {
    for (const [fragment, rows] of rowsByFragment) {
      if (sql.includes(fragment)) return rows;
    }
    return undefined;
  }

  const db: MockD1 = {
    prepare(sql) {
      if (typeof sql !== "string") {
        throw new Error(`prepare called with non-string: ${typeof sql} (db=${typeof db})`);
      }
      return {
        bind(...binds: unknown[]) {
          const recordCall = (method: CapturedCall["method"]) => {
            calls.push({ sql, binds, method });
          };
          return {
            async first<T>(): Promise<T | null> {
              recordCall("first");
              const rows = findRows(sql);
              if (rows && rows.length > 0) return rows[0] as T;
              if (options.defaultFirst !== undefined) {
                return options.defaultFirst as T;
              }
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              recordCall("all");
              const rows = findRows(sql);
              return { results: (rows ?? []) as T[] };
            },
            async run(): Promise<{ meta: { changes: number } }> {
              recordCall("run");
              const rows = findRows(sql);
              return { meta: { changes: rows?.length ?? 1 } };
            },
          };
        },
      };
    },
    __calls: calls,
    __sqlContaining(fragment: string): CapturedCall[] {
      return calls.filter((c) => c.sql.includes(fragment));
    },
    __reset() {
      calls.length = 0;
    },
  };
  return db;
}