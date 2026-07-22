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
 *  - "seed" (rowsByFragment): returns pre-configured rows keyed by SQL fragment.
 *
 * rowsByFragment Map values can be either:
 *  - `unknown[]`: returned as-is for first() / all()
 *  - `(sql, callIndex) => unknown[]`: function matcher called per query,
 *    useful when the same SQL is issued multiple times with different expected results.
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
  batch(statements: Array<{ run(): Promise<{ meta: { changes: number } }> }>): Promise<Array<{ meta: { changes: number } }>>;
  /** Test helpers — not part of D1Database interface */
  __calls: CapturedCall[];
  __sqlContaining(fragment: string): CapturedCall[];
  __reset(): void;
  __callCounts: Map<string, number>;
}

export type FragmentMatcher =
  | unknown[]
  | ((sql: string, callIndex: number) => unknown[]);

export interface MockD1Options {
  /** Map of SQL fragment → rows or matcher function */
  rowsByFragment?: Map<string, FragmentMatcher>;
  /** Default row for first() when no fragment matches */
  defaultFirst?: unknown;
  /** Error raised when executing SQL that contains this fragment. */
  runErrorByFragment?: Map<string, Error>;
}

export function createMockD1(options: MockD1Options = {}): MockD1 {
  const calls: CapturedCall[] = [];
  const rowsByFragment =
    options.rowsByFragment ?? new Map<string, FragmentMatcher>();
  const runErrorByFragment = options.runErrorByFragment ?? new Map<string, Error>();
  const callCounts = new Map<string, number>();

  function findRows(sql: string): unknown[] | undefined {
    for (const [fragment, matcher] of rowsByFragment) {
      if (sql.includes(fragment)) {
        if (typeof matcher === "function") {
          const idx = callCounts.get(fragment) ?? 0;
          callCounts.set(fragment, idx + 1);
          return matcher(sql, idx);
        }
        return matcher;
      }
    }
    return undefined;
  }

  function findRunError(sql: string): Error | undefined {
    for (const [fragment, error] of runErrorByFragment) {
      if (sql.includes(fragment)) return error;
    }
    return undefined;
  }

  const db: MockD1 = {
    prepare(sql) {
      if (typeof sql !== "string") {
        throw new Error(`prepare called with non-string: ${typeof sql}`);
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
              const error = findRunError(sql);
              if (error) throw error;
              const rows = findRows(sql);
              return { meta: { changes: rows?.length ?? 1 } };
            },
          };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
    __calls: calls,
    __sqlContaining(fragment: string): CapturedCall[] {
      return calls.filter((c) => c.sql.includes(fragment));
    },
    __reset() {
      calls.length = 0;
      callCounts.clear();
    },
    __callCounts: callCounts,
  };
  return db;
}
