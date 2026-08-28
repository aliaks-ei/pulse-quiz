# Pulse Quiz

Pulse Quiz is a realtime multiplayer trivia app. Hosts create and run quizzes,
then players join a live room with an invite link or room code. The app is built
with Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, and Supabase.

## What it does

- Create multilingual quizzes with sections, media, configurable scoring, and timed or host-controlled progression.
- Run a live multiplayer room with anonymous player joins, presence, resume, scoring, round summaries, and final results.
- Use supplied avatar presets or upload a private avatar for the current room.
- Translate quiz content through a server-side OpenAI integration.

## Architecture

The browser owns rendering and local interaction. Supabase is the source of truth for session lifecycle, scoring, authorization, Realtime events, and Storage. Privileged database helpers are not browser RPCs; external operations such as avatar upload and translation run in authenticated Edge Functions.

```text
Vue browser → Supabase Auth / RPC / Realtime / Storage
                     ↓
              PostgreSQL + RLS
                     ↓
           Authenticated Edge Functions → OpenAI
```

## Prerequisites

- Node.js 22
- npm
- Docker and the Supabase CLI for local Supabase development
- A Supabase project for staging or production

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Set the public browser values:

   | Variable                                | Purpose                                           |
   | --------------------------------------- | ------------------------------------------------- |
   | `VITE_SUPABASE_URL`                     | Supabase project URL                              |
   | `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Browser publishable key                           |
   | `VITE_APP_URL`                          | App origin, defaulting to `http://localhost:5175` |

   Never expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` in a Vite environment variable. Configure them only as Supabase Edge Function secrets.

4. Start the local Supabase stack and apply migrations:

   ```bash
   npx supabase start
   npx supabase db reset
   ```

5. Serve the frontend:

   ```bash
   npm run dev
   ```

## Avatar assets

Avatar presets are intentionally stored in the `avatar-presets` Supabase Storage bucket, not in this repository. Upload the approved WebP assets under:

```text
v1/robot.webp
v1/mushroom.webp
v1/fox.webp
v1/owl.webp
v1/astronaut-cat.webp
v1/octopus.webp
```

The `player-avatars` bucket is private. The `upload-avatar` Edge Function accepts a browser-normalized WebP, validates its file signature and size, and returns an opaque asset ID. Only people in the same live session can request a signed URL for that avatar.

## Question media

Question media is stored in the private `pulse-quiz-question-media` Cloudflare R2 bucket, not in Supabase Storage. Create the bucket and an S3 API token scoped to it with object read and write, then set the Edge Function secrets:

```bash
npx supabase secrets set \
  R2_ACCOUNT_ID=your-cloudflare-account-id \
  R2_ACCESS_KEY_ID=your-r2-access-key-id \
  R2_SECRET_ACCESS_KEY=your-r2-secret-access-key \
  R2_BUCKET=pulse-quiz-question-media
```

The `upload-question-media` Edge Function is the only writer. It validates the file signature against the declared type, enforces the 25 MB per-file limit, and rejects the upload when the account is over its storage quota. The quota is `private.plan_definitions.max_storage_bytes`, 500 MB on the free plan, so raising it is a row update rather than a deploy.

Media a question no longer uses is not deleted from the browser. `gameService.deleteUploadedMedia` calls `public.schedule_media_deletion`, which marks the asset `scheduled_for_deletion`: that frees the account's quota straight away and leaves the object itself to the reaper.

### Moving existing media to R2

`scripts/migrate-media-to-r2.ts` copies the objects a question still references out of the legacy `question-media` Supabase bucket, keeping the object path unchanged, verifying each copy by MD5 and size, and repointing its `media_assets` row. Orphans are never copied, so run `npm run media:reap-orphans -- --apply` first. It needs `SUPABASE_SERVICE_ROLE_KEY` and the `R2_*` values in `.env`:

```bash
npm run media:migrate-to-r2            # dry run: lists what would move
npm run media:migrate-to-r2 -- --apply # copies and verifies
```

The run is resumable and safe to repeat: anything already in R2 is skipped, and a half-finished run still plays, because unmoved assets keep resolving through the legacy fallback. Once the fallback has logged nothing for a week, make the Supabase `question-media` bucket private.

The `media-url` Edge Function is the only reader. It presigns R2 objects for two hours after `public.authorize_media_paths` confirms the caller owns the quiz or holds a player row in one of its unfinished sessions. Assets still held in Supabase Storage come back in the response's `legacy` list, and `src/lib/mediaUrl.ts` falls back to the legacy public URL for those and logs each fallback.

## Retention

Three `pg_cron` jobs keep the database and the media bucket from growing without bound. Each one is defined in `supabase/migrations/*_retention_jobs.sql` and reads its window and its arming switch from `private.retention_settings`:

| Job                      | Takes                                                             | Window  |
| ------------------------ | ----------------------------------------------------------------- | ------- |
| `purge_trashed_games`    | Quizzes trashed and never restored, with their media marked first | 30 days |
| `expire_anonymous_users` | Anonymous accounts with no player row, no quiz and no asset       | 15 days |
| `mark_detached_media`    | Assets no question references, marked for the reaper              | 1 day   |

Every job ships **report-only**. It runs on schedule, writes what it matched to `private.retention_runs`, and deletes nothing until its row is armed. Read a cycle or two first, then arm it:

```sql
select job_key, ran_at, matched_count, sample
from private.retention_runs
order by ran_at desc
limit 20;

update private.retention_settings set is_armed = true, updated_at = now()
where job_key = 'purge_trashed_games';
```

Both deletions are irreversible. Changing a window is the same kind of update, so neither the schedule nor the retention period needs a deploy.

### The media reaper

Postgres cannot reach R2, so no job deletes an object. `workers/media-reaper` is a Cloudflare Cron Trigger with the bucket binding: it reads the rows marked `scheduled_for_deletion`, deletes the objects, then deletes the rows. Rows from the legacy Supabase bucket are counted and left for `npm run media:reap-orphans`.

```bash
cd workers/media-reaper
npm install
npx wrangler login
npx wrangler secret put SUPABASE_URL              # https://<project-ref>.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Wrangler is pinned in this directory's own `package.json` rather than the app's, so deploying the Worker never enters the app's install or CI. `npm run logs` tails a live run.

## Edge Functions

Deploy the tracked functions after setting required secrets:

```bash
npx supabase functions deploy translate-quiz
npx supabase functions deploy upload-avatar
npx supabase functions deploy upload-question-media
npx supabase functions deploy media-url
```

`translate-quiz` requires `OPENAI_API_KEY`; `upload-question-media` and `media-url` require the `R2_*` secrets above. Both, along with `upload-avatar`, use the Supabase runtime service-role secret and must retain JWT verification.

## Verification

```bash
npm run type-check
npm run lint
npx prettier . --check
npm run test
npm run build
```

## Production checklist

- Apply migrations to a staging project before production.
- Configure Auth redirect URLs, CAPTCHA, SMTP, custom domain, TLS and security headers at the host.
- Keep production and staging Supabase projects separate.
- Set OpenAI quotas and spend alerts.
- Enable GitHub branch protection, Dependabot, secret scanning, push protection and code scanning before opening the repository publicly.
- Read one cycle of `private.retention_runs` before arming a retention job, and deploy `workers/media-reaper` before arming `mark_detached_media`.
- Run a two-browser host/player smoke test after each database or Realtime change.

## Contributing and security

Please do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) for the disclosure process and [CONTRIBUTING.md](CONTRIBUTING.md) for local contribution guidance.

## License

This project is licensed under the [MIT License](LICENSE).
