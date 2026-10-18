# Supabase backend for equipDemo

The app reads and adds rows in one table, `public.equipment`, using the project's
**publishable (anon) key**. What that key may do is decided entirely by the
row-level security (RLS) policies below.

## Table

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint`, identity, primary key | Assigned by the database |
| `name` | `text`, not null | 2–60 characters after trimming |
| `price_per_hour` | `numeric(10,2)`, not null | Greater than 0, at most 100000 |
| `created_at` | `timestamptz`, default `now()` | Assigned by the database |

The app validates the same rules before submitting (`src/domain/equipment.ts`); the
database enforces them again with check constraints, so a modified client cannot
store bad data.

## Access rules (RLS)

| Operation | Publishable key (`anon`) | Policy |
|---|---|---|
| Read (`select`) | Allowed | `equipment_select_public`: all rows |
| Add (`insert`) | Allowed | `equipment_insert_public`: only rows passing the value rules |
| Change (`update`) | **Denied** | No policy and no grant |
| Remove (`delete`) | **Denied** | No policy and no grant |

Inserting is open to anyone who has the app because this demo has no sign-in.
For production, restrict the insert policy to `authenticated` users and add rate limiting.

## Set up or align your project

1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
   It works on a new or an existing `equipment` table and is safe to run again.
3. Optional: run [`supabase/seed.sql`](../supabase/seed.sql) the same way. It adds five
   demo rows only if the table is empty.
4. Check: **Table Editor → equipment** shows "RLS enabled", and **Authentication →
   Policies** lists the two policies above.

If your existing `id` column has no default (inserts fail with a "null value in
column id" error), recreate it as an identity column, or ask for help before
changing a table that holds data you need.

## Configure the app

Copy `.env.example` to `.env` (git-ignored) and fill in values from the dashboard's
project settings (API / API Keys section):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>
```

After changing `.env`, restart Metro with `npm start -- --reset-cache`, because the
values are copied into the JavaScript bundle at build time.

Without these variables the app still runs, using built-in demo data, and the home
screen shows **"Demo data (no backend configured)"**.

## Security rules

- **Never** put the `service_role` / secret key in the app, `.env`, CI logs or the repo.
  It bypasses RLS. The app only reads the two variables above (`babel.config.js` allow-list).
- The publishable key is visible to anyone who unpacks the app. That is expected;
  RLS is what protects the data.
- `.env` files are git-ignored. Only `.env.example` (placeholders) is committed.
- The app does not log submitted records, keys or raw backend errors. Users see
  plain-language messages (`src/data/DataError.ts`).
- Only non-sensitive demo data belongs in this table.

## Verifying

### Automated, no backend needed (`npm test`, runs in CI)

| What | Test file |
|---|---|
| Input validation rules | `__tests__/equipment.test.ts` |
| Fetch and submit query shape, row filtering, error mapping, timeout | `__tests__/supabaseEquipmentRepository.test.ts` |
| Home: loading, list, empty, error + retry, refresh, success message | `__tests__/HomeScreen.test.tsx` |
| Form: validation, submit, server error | `__tests__/AddEquipmentScreen.test.tsx` |

### Automated, against the live project (`npm run test:integration`)

Uses `.env`. Checks that fetching works, a submit is stored and read back, update and
delete are blocked by RLS, and the database rejects invalid values. Each run adds one
row named `Integration check <number>`; remove these in the Table Editor when convenient.

### Manual checks on a device or emulator

| # | Step | Expected |
|---|---|---|
| 1 | Launch with `.env` set | Header "equipDemo", badge "Live data · Supabase", list of equipment |
| 2 | Tap **Refresh** (or pull down) | List reloads |
| 3 | **+ Add equipment** → tap **Save** with empty fields | "Enter a name." and "Enter a price per hour." |
| 4 | Enter name `Tower Crane`, price `abc` → **Save** | "Enter a number, e.g. 1500 or 1499.50." |
| 5 | Enter price `2500` → **Save** | Back on Home, "Added “Tower Crane”.", item at top of list |
| 6 | Supabase Table Editor | New row present |
| 7 | Turn on airplane mode → **Refresh** | "Can't reach the server…", list still shown |
| 8 | Airplane mode → add an item | "Can't reach the server…", form keeps the input |
| 9 | Launch without `.env` | Badge "Demo data (no backend configured)", demo list |
