// Generates synthetic browsing data for benchmarks and demos.
//   node scripts/seed.js --confirm=<DB_NAME> [--rows 1000000] [--users 5] [--days 90]
// Refuses to run unless --confirm repeats the database name, so it can't hit a real DB by accident.
import bcrypt from "bcrypt";
import db from "../db.js";

const flag = (name, fallback) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=")[1];
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const rows = parseInt(flag("rows", 1_000_000));
const users = parseInt(flag("users", 5));
const days = parseInt(flag("days", 90));

if (flag("confirm") !== process.env.DB_NAME) {
  console.error(`Refusing to seed. Re-run with --confirm=${process.env.DB_NAME} to write synthetic data into that database.`);
  process.exit(1);
}

const hash = await bcrypt.hash("demo-password", 10);
const ids = [];
for (let i = 1; i <= users; i++) {
  const r = await db.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [`demo${i}@example.test`, hash]
  );
  ids.push(r.rows[0].id);
}

const t0 = Date.now();
await db.query(
  `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
   SELECT s.uid, gen_random_uuid(), 'https://' || s.domain || '/page/' || (s.g % 200), s.domain, 'Page ' || (s.g % 200),
          s.ts, s.ts + s.dur * INTERVAL '1 second', s.dur
   FROM (
     SELECT u AS uid, g,
            (ARRAY['youtube.com','reddit.com','twitter.com','github.com','news.ycombinator.com','netflix.com','instagram.com',
                   'stackoverflow.com','docs.google.com','mail.google.com','linkedin.com','twitch.tv','wikipedia.org','amazon.com',
                   'medium.com','figma.com','notion.so','spotify.com','facebook.com','npmjs.com'])
              [1 + floor(power(random(), 2) * 20)::int] AS domain,
            NOW() - random() * $2::int * INTERVAL '1 day' AS ts,
            5 + floor(random() * 600)::int AS dur
     FROM unnest($1::int[]) AS u, generate_series(1, $3::int) AS g
   ) s`,
  [ids, days, Math.ceil(rows / users)]
);

await db.query(
  `INSERT INTO tracking_sessions (user_id, start_time, end_time)
   SELECT u, d + (h * INTERVAL '1 hour'), d + (h * INTERVAL '1 hour') + INTERVAL '45 minutes'
   FROM unnest($1::int[]) AS u,
        generate_series(NOW() - $2::int * INTERVAL '1 day', NOW(), INTERVAL '1 day') AS d,
        generate_series(9, 15, 3) AS h
   WHERE d + (h * INTERVAL '1 hour') + INTERVAL '45 minutes' < NOW()`,
  [ids, days]
);
await db.query("ANALYZE tab_activity");
await db.query("ANALYZE tracking_sessions");

const n = (await db.query("SELECT COUNT(*) FROM tab_activity")).rows[0].count;
console.log(`seeded ${users} users, tab_activity now ${n} rows (${((Date.now() - t0) / 1000).toFixed(1)}s). Demo login: demo1@example.test / demo-password`);
await db.end();
