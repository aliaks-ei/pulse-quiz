# AGENTS.md

## Purpose

This repository is a realtime multiplayer trivia app built with Vue 3, TypeScript, Vite, Pinia, Vue Router, Tailwind CSS v4, motion-v, Vitest, and Supabase.

Use this file as the default operating guide for agents working in this repo.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.
4. Link the repo to the target Supabase project.
5. Apply the migrations in [`supabase/migrations`](supabase/migrations) with `npx supabase db push`.

If the Supabase env vars are missing, the app still boots with placeholder values but network features will not work.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: type-check and build production assets
- `npm run type-check`: run TypeScript checks without emitting files
- `npm run lint`: run ESLint across the repo
- `npm run format`: run Prettier across the repo
- `npm run test`: run the Vitest suite
- `npm run preview`: preview the production build locally

Run `npm run type-check`, `npm run lint`, and `npm run format` after code changes at minimum. Run `npm run test` when touching shared helpers, stores, or other covered logic. Run `npm run build` when touching app wiring, routing, or type-heavy flows.

## Project Layout

- [`src/main.ts`](src/main.ts): app bootstrap
- [`src/router/index.ts`](src/router/index.ts): route definitions
- [`src/views`](src/views): top-level route views
- [`src/components`](src/components): shared UI and layout components
- [`src/components/play`](src/components/play): extracted live-game phase and host-control components used by the play view
- [`src/stores`](src/stores): Pinia stores using the setup-store pattern
- [`src/services`](src/services): Supabase client, RPC calls, and realtime subscriptions
- [`src/composables`](src/composables): reusable composition logic
- [`src/lib`](src/lib): shared client helpers, auth bootstrap, local storage helpers, and their Vitest coverage
- [`src/types/domain.ts`](src/types/domain.ts): shared domain model types
- [`src/types/db-rows.ts`](src/types/db-rows.ts): typed Supabase row shapes used when normalizing RPC and query results
- [`src/assets/main.css`](src/assets/main.css): global theme tokens and shared utility classes
- [`supabase/migrations`](supabase/migrations): canonical database schema, RPCs, policies, storage, and realtime bootstrap

## Repo Conventions

- Prefer TypeScript-first changes and keep domain types in sync with Supabase payload shapes.
- Use the `@/` alias for imports from `src`.
- Follow the existing Pinia setup-store style with `ref`, `computed`, and plain async functions.
- Keep view components thin when possible; push backend access into `src/services` and shared state into `src/stores`.
- Realtime session flows depend on Supabase RPCs and subscriptions. When changing session lifecycle behavior, review both [`src/services/gameService.ts`](src/services/gameService.ts) and [`src/services/realtime.ts`](src/services/realtime.ts).
- Tailwind v4 theme tokens and custom utility classes live in [`src/assets/main.css`](src/assets/main.css). Extend that file instead of scattering duplicate color or radius values.
- UI styling in this repo is intentionally bold and motion-aware. Preserve the current visual language instead of flattening it into generic defaults.
- Existing code omits semicolons and uses single quotes. Match the current formatting style.

## Supabase Notes

- Make every schema change through a committed migration, including exploratory
  changes; never leave changes applied only through the Dashboard SQL editor.
  The `Database` GitHub Actions workflow enforces this by rebuilding the local
  database from migrations and checking the production schema invariants.
- Anonymous auth is expected and is initialized on app mount.
- Invite links point to live sessions, not reusable quiz templates.
- Resume behavior is same-browser only and relies on both Supabase auth persistence and local storage.
- Client-side guards are not enough for game integrity. If you change answer submission, session advancement, scoring, or host controls, keep enforcement on the Supabase RPC side.
- Treat schema and RPC changes as application changes, not docs-only edits.

## Testing And Validation

Vitest is set up for shared client-side logic in [`src/lib`](src/lib). There is still no dedicated e2e setup. Validate changes with:

1. `npm run type-check`
2. `npm run lint`
3. `npm run format`
4. `npm run test` when the changed logic has Vitest coverage or belongs in shared helpers
5. `npm run build` for broader integration confidence
6. Manual smoke testing of the affected route or multiplayer flow when behavior depends on Supabase or realtime updates

## Agent Expectations

- Do not start `npm run dev`, `npm run preview`, or another local development server unless the user explicitly requests it. Assume the user manages running server processes for manual UI verification.
- Do not introduce a new framework, state library, or styling system without explicit user approval.
- Avoid broad refactors unless they are required for the task.
- If a change touches Supabase schema or RPC contracts, call that out clearly in your summary.
- If you cannot fully validate a change because Supabase credentials or backend resources are unavailable, say so explicitly.
