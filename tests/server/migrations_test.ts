// Ticket 51: migration 003 merged and deployed while learn-prod had never run it, and nothing
// caught it before ticket 50 found every progress-sync route answering 500 for hours. These tests
// hold the comparison logic (pendingAgainst) and the read-only pending check (pendingMigrations)
// that scripts/deploy.ts and scripts/smoke-prod.ts now both refuse or fail on.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import type {
  Client,
  InStatement,
  ResultSet,
} from "@tursodatabase/serverless/compat";
import {
  appliedLedger,
  migrateDatabase,
  migrationHistory,
  pendingAgainst,
  pendingMigrations,
} from "../../src/server/migrations.ts";

Deno.test("pendingAgainst lists a migration with no applied entry, in file order", () => {
  const history = [{ version: "001_a.sql", sql: "", checksum: "aaa" }, {
    version: "002_b.sql",
    sql: "",
    checksum: "bbb",
  }];
  const pending = pendingAgainst(history, new Map());
  assertEquals(pending.map((migration) => migration.version), [
    "001_a.sql",
    "002_b.sql",
  ]);
});

Deno.test("pendingAgainst omits a migration whose checksum matches what is applied", () => {
  const history = [{ version: "001_a.sql", sql: "", checksum: "aaa" }, {
    version: "002_b.sql",
    sql: "",
    checksum: "bbb",
  }];
  const pending = pendingAgainst(history, new Map([["001_a.sql", "aaa"]]));
  assertEquals(pending.map((migration) => migration.version), ["002_b.sql"]);
});

Deno.test("pendingAgainst throws when an applied migration's checksum no longer matches the file", () => {
  const history = [{ version: "001_a.sql", sql: "", checksum: "aaa" }];
  assertThrows(
    () => pendingAgainst(history, new Map([["001_a.sql", "changed"]])),
    Error,
    "001_a.sql changed after application",
  );
});

Deno.test("pendingAgainst is empty once every history entry is applied", () => {
  const history = [{ version: "001_a.sql", sql: "", checksum: "aaa" }, {
    version: "002_b.sql",
    sql: "",
    checksum: "bbb",
  }];
  const pending = pendingAgainst(
    history,
    new Map([["001_a.sql", "aaa"], ["002_b.sql", "bbb"]]),
  );
  assertEquals(pending, []);
});

Deno.test("pendingAgainst ignores a version the database has that this checkout's history does not", () => {
  // An older checkout must not treat a newer database as broken; it just has nothing to apply.
  const history = [{ version: "001_a.sql", sql: "", checksum: "aaa" }];
  const pending = pendingAgainst(
    history,
    new Map([["001_a.sql", "aaa"], ["999_future.sql", "zzz"]]),
  );
  assertEquals(pending, []);
});

/** A Client fake that only understands the schema_migrations bookkeeping migrateDatabase issues. */
class FakeMigrationsClient implements Pick<Client, "execute" | "batch"> {
  ledger: Array<{ version: string; checksum: string }> = [];

  execute(stmt: InStatement): Promise<ResultSet> {
    const sql = (typeof stmt === "string" ? stmt : stmt.sql).trim();
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) {
      return Promise.resolve(emptyResult());
    }
    if (sql.startsWith("SELECT version, checksum FROM schema_migrations")) {
      return Promise.resolve({
        ...emptyResult(),
        rows: this.ledger.map((row) => rowOf(row)),
      });
    }
    throw new Error(`FakeMigrationsClient does not understand: ${sql}`);
  }

  batch(stmts: InStatement[]): Promise<any> {
    for (const stmt of stmts) {
      const sql = (typeof stmt === "string" ? stmt : stmt.sql).trim();
      if (sql.startsWith("INSERT INTO schema_migrations")) {
        const args = (stmt as { args?: unknown[] }).args ?? [];
        this.ledger.push({
          version: String(args[0]),
          checksum: String(args[1]),
        });
      }
      // Every other statement is a migration file's own DDL; the fake accepts it without modelling
      // the schema, because this test is about the bookkeeping, not the SQL each migration runs.
    }
    return Promise.resolve([]);
  }
}

function emptyResult(): ResultSet {
  return {
    columns: [],
    columnTypes: [],
    rows: [],
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({}),
  };
}

function rowOf(row: Record<string, unknown>) {
  const values = Object.values(row);
  const proxy = { ...row, length: values.length } as any;
  values.forEach((value, index) => (proxy[index] = value));
  return proxy;
}

Deno.test("appliedLedger and pendingMigrations read a fresh database as every history entry pending", async () => {
  const db = new FakeMigrationsClient() as unknown as Client;
  const ledger = await appliedLedger(db);
  assertEquals(ledger.size, 0);
  const pending = await pendingMigrations(db);
  const history = await migrationHistory();
  assertEquals(pending, history.map((migration) => migration.version));
});

Deno.test("migrateDatabase applies only what is pending, and pendingMigrations is empty afterward", async () => {
  const db = new FakeMigrationsClient() as unknown as Client;
  const history = await migrationHistory();
  assert(
    history.length >= 1,
    "the repository must carry at least one migration for this test to mean anything",
  );

  const applied = await migrateDatabase(db);
  assertEquals(applied, history.map((migration) => migration.version));
  assertEquals(await pendingMigrations(db), []);

  // Idempotent: re-running finds nothing left to do.
  assertEquals(await migrateDatabase(db), []);
});

Deno.test("pendingMigrations reports exactly the migrations missing from an under-migrated database", async () => {
  // Simulates ticket 50: learn-prod had 001 and 002 applied but not 003. Seeds a fake database with
  // every migration but the newest already applied, using this checkout's own real checksums, and
  // confirms the read-only check names precisely the gap — the check deploy.ts and smoke-prod.ts
  // now both run before anything relies on the missing table.
  const history = await migrationHistory();
  if (history.length < 2) return; // Nothing to simulate a gap with; the other tests still cover the logic.
  const fake = new FakeMigrationsClient();
  for (const migration of history.slice(0, -1)) {
    fake.ledger.push({
      version: migration.version,
      checksum: migration.checksum,
    });
  }
  const db = fake as unknown as Client;

  const pending = await pendingMigrations(db);
  assertEquals(pending, [history.at(-1)!.version]);

  const applied = await migrateDatabase(db);
  assertEquals(applied, [history.at(-1)!.version]);
  assertEquals(await pendingMigrations(db), []);
});
