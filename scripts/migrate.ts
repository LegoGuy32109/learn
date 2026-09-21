import { createDb } from "../src/server/db.ts";
import { migrateDatabase } from "../src/server/migrations.ts";

const applied = await migrateDatabase(createDb());
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
