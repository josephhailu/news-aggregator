import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://news:news@localhost:5433/news_aggregator";

const email = (process.env.DEV_ADMIN_EMAIL ?? "admin@local.test").toLowerCase();
const password = process.env.DEV_ADMIN_PASSWORD ?? "devpassword123";
const name = process.env.DEV_ADMIN_NAME ?? "Local Admin";

function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(value.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2
  });

  return `${salt}:${key.toString("hex")}`;
}

const sql = postgres(connectionString, {
  max: 1,
  prepare: false
});

let exitCode = 0;

try {
  const passwordHash = hashPassword(password);
  const existingUsers = await sql<{ id: string }[]>`
    select id
    from "user"
    where email = ${email}
    limit 1
  `;

  if (existingUsers.length > 0) {
    const userId = existingUsers[0]!.id;

    await sql`
      update "user"
      set name = ${name},
          email_verified = true,
          updated_at = now()
      where id = ${userId}
    `;

    const credentialAccounts = await sql<{ id: string }[]>`
      select id
      from account
      where user_id = ${userId}
        and provider_id = 'credential'
      limit 1
    `;

    if (credentialAccounts.length > 0) {
      await sql`
        update account
        set password = ${passwordHash},
            updated_at = now()
        where id = ${credentialAccounts[0]!.id}
      `;
    } else {
      await sql`
        insert into account (
          id,
          account_id,
          provider_id,
          user_id,
          password,
          created_at,
          updated_at
        ) values (
          ${randomUUID()},
          ${userId},
          'credential',
          ${userId},
          ${passwordHash},
          now(),
          now()
        )
      `;
    }

    console.log(`Dev admin synced: ${email}`);
  } else {
    const userId = randomUUID();

    await sql`
      insert into "user" (
        id,
        name,
        email,
        email_verified,
        created_at,
        updated_at
      ) values (
        ${userId},
        ${name},
        ${email},
        true,
        now(),
        now()
      )
    `;

    await sql`
      insert into account (
        id,
        account_id,
        provider_id,
        user_id,
        password,
        created_at,
        updated_at
      ) values (
        ${randomUUID()},
        ${userId},
        'credential',
        ${userId},
        ${passwordHash},
        now(),
        now()
      )
    `;

    console.log(`Created dev admin: ${email}`);
  }
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await sql.end();
}

process.exit(exitCode);
