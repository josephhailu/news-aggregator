import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://news:news@localhost:5433/news_aggregator";

export const sql = postgres(connectionString, {
  max: 10,
  prepare: false
});

export const db = drizzle(sql, { schema });

export * from "./schema";
