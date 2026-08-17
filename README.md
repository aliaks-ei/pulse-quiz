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

## Edge Functions

Deploy the tracked functions after setting required secrets:

```bash
npx supabase functions deploy translate-quiz
npx supabase functions deploy upload-avatar
```

`translate-quiz` requires `OPENAI_API_KEY`; `upload-avatar` uses the Supabase runtime service-role secret and must retain JWT verification.

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
- Run a two-browser host/player smoke test after each database or Realtime change.

## Contributing and security

Please do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) for the disclosure process and [CONTRIBUTING.md](CONTRIBUTING.md) for local contribution guidance.

## License

This project is licensed under the [MIT License](LICENSE).
