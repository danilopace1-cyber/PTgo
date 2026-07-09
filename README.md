# PTgo

A workout tracker built around the personal trainer ↔ client relationship. See
[ptgo-spec.md](./ptgo-spec.md) for the full product spec.

**Stack**: React Native + Expo (expo-router) · Supabase (Postgres, Auth, RLS)

## Status

MVP step 1 is implemented: email/password auth with role selection at signup
(trainer or client), and the trainer↔client connect flow (trainers get a
6-character invite code to share; clients enter it to connect; trainers can
remove clients).

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Set up Supabase (either option):

   **Local** (requires Docker Desktop):

   ```sh
   npx supabase start
   ```

   This applies `supabase/migrations/` automatically and prints an API URL and
   anon key. After schema changes, re-apply with `npm run db:reset`.

   **Hosted**: create a project at [supabase.com](https://supabase.com), then
   either run the migration SQL in the dashboard's SQL editor, or link and push:

   ```sh
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

3. Configure the app:

   ```sh
   cp .env.example .env
   ```

   Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   When testing on a physical device against local Supabase, use your
   machine's LAN IP in the URL (e.g. `http://192.168.1.20:54321`), not
   `127.0.0.1`.

4. Run it:

   ```sh
   npm start        # Expo dev server (scan QR with Expo Go)
   npm run web      # or in a browser
   ```

## Trying the connect flow

1. Sign up as a trainer — the home screen shows your invite code.
2. Sign up as a client in another session (or after signing out).
3. On the client home, enter the trainer's code under "Have a trainer?".
4. The client appears in the trainer's roster; "Remove" ends the connection
   (rejoining with the same code reactivates it).

Note: local Supabase has email confirmation disabled, so signup signs you in
immediately. On a hosted project, either disable "Confirm email" under
Authentication → Providers → Email, or confirm via the emailed link before
signing in.

## Project layout

```
app/                expo-router routes
  (auth)/           sign in, sign up (public)
  (app)/            authenticated screens, role-switched home
components/         shared UI (design tokens live in lib/theme.ts)
lib/                supabase client, auth context, theme, types
supabase/           local dev config + SQL migrations
```
