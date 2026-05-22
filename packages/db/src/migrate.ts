import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://news:news@localhost:5433/news_aggregator";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../drizzle");
const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  await sql`
    create table if not exists app_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const applied = await sql<{ filename: string }[]>`
      select filename from app_migrations where filename = ${file}
    `;

    if (applied.length > 0) {
      console.log(`Skipping ${file}`);
      continue;
    }

    const migration = await readFile(join(migrationsDir, file), "utf8");
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }

      await tx`insert into app_migrations (filename) values (${file})`;
    });

    console.log(`Applied ${file}`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
