import { createApp } from "./src/app.ts";
import { TokenAuthenticator } from "./src/server/auth.ts";
import { createDb } from "./src/server/db.ts";
import { TursoLessonRepository } from "./src/server/repositories/lessons.ts";

const db = createDb();
const app = createApp({ lessons: new TursoLessonRepository(db), auth: new TokenAuthenticator(db) });
const port = Number(Deno.env.get("PORT") ?? 8000);
Deno.serve({ port }, app);
