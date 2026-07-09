# PTgo — Product Spec

## One-liner
A Hevy-style workout tracker rebuilt around the personal trainer ↔ client relationship: PTs create and assign time-limited programs; clients get a dead-simple app to follow them, log their lifts, and share progress.

## Why it exists
Existing apps (Hevy etc.) are great for solo lifters but have weak trainer features. Sharing workouts with other users is limited. This app makes the PT a first-class account type with program assignment, expiry control, client progress visibility, and PDF export.

---

## Account types (chosen at signup)

### 1. Trainer (PT)
- Create workouts and multi-week programs from the exercise library (+ custom exercises with own photos/videos).
- Assign programs to connected clients.
- **Program expiry**: PT sets how long an assigned program stays active on the client's profile. On expiry the client loses access to the *program content* (never their own logged data — see Data Ownership).
- Per-client expiry policy, chosen by the PT: (a) expire fully, (b) convert to read-only archive for the client, (c) auto-generate a PDF for the client on expiry, or (d) both archive + PDF. **Decision: default to (d) both.**
- **Expiry notifications**: PT gets notified X days before a client's program expires (default 7, configurable) so they can program the next block for active clients.
- **Client history vault**: PT can view every past program they assigned to a client, plus that client's logged performance (weights, reps, RPE, adherence), even after the program expired — this is their coaching record for tracking progress.
- **PDF export**: export any workout/program as a clean, branded PDF (for clients who don't use the app, or former clients who paid for a block and want a copy).
- **Adherence dashboard**: see per-client completion rates, last workout date, and streaks.
- Client roster management: invite clients via link/code, remove clients.

### 2. Client
- Simple, minimal UI — logging a workout should take zero learning.
- View currently assigned program(s) and today's workout.
- Log per-exercise: weight, reps, sets completed; previous session's numbers shown inline (Hevy-style).
- Rest timer between sets.
- RPE / difficulty note per exercise, visible to their PT.
- Comment thread per workout and per exercise ("how did this feel?"), e.g. "knee hurt on lunges, alternative?" **PT receives a push notification when a client leaves a comment** so issues get caught fast.
- **Physique log**: private photo storage with dates (+ optional body measurements: weight, waist, etc.). Visible to PT only if client explicitly shares.
- Progress charts per exercise (top set / estimated 1RM over time) and PR badges.
- Workout streaks: optional, client can toggle on/off (motivational gimmick for some, noise for others). Adherence data still flows to the PT dashboard regardless of the toggle.
- View expired programs only if the PT enabled archive mode for them.
- Can also create their own personal workouts (solo mode) independent of any PT — their data isn't held hostage to having a trainer.
- kg/lb unit toggle.

---

## Data ownership rules (important)
- **Program content** (exercises, sets/reps schemes written by the PT) = PT's intellectual property. Access for the client is time-limited per the PT's expiry setting.
- **Logged performance data, photos, measurements** = the client's, forever. Never expires, never deleted when a PT relationship ends.
- When a client leaves a PT: the PT keeps the coaching record (programs they wrote + the client's logged results during the engagement, for reference); the client keeps all their own logs and any PDFs/archives already granted.

---

## Exercise library
- Seed the database with **Free Exercise DB** (https://github.com/yuhonas/free-exercise-db) — 800+ exercises, public domain, JSON with images. Fields: name, force, level, mechanic, equipment, primaryMuscles, secondaryMuscles, instructions, images.
- Note: this is a *dataset*, not a web service — it's imported once into our own DB and storage, so the mobile app never depends on it at runtime. No rate limits, no external dependency, commercially safe (public domain).
- Import script: fetch the combined exercises.json, load into our DB, mirror images to our own storage (don't hotlink long-term).
- Optionally evaluate self-hosted open-source ExerciseDB API later for GIF/video demos (check license for the full dataset before commercial use).
- Custom exercises: both PTs and clients can create them (name, muscles, equipment, instructions, photo/video upload). PT custom exercises are included in assigned programs automatically.

---

## Core flows

### PT assigns a program
1. PT builds program: named blocks → workouts → exercises → target sets/reps/rest (and optional %/RPE targets).
2. PT selects client(s), sets active duration (e.g. 6 weeks) and expiry policy.
3. Client gets a notification; program appears in their app.
4. 7 days before expiry: PT notified "Program for [client] expires soon."
5. On expiry: applied policy (remove / archive read-only / auto-PDF).

### Client does a workout
1. Open app → today's workout front and center.
2. Tap exercise → see demo image/instructions → log sets (weight × reps), previous numbers pre-filled as placeholders.
3. Rest timer auto-starts after logging a set.
4. Optional RPE + note per exercise. Finish → summary → data syncs to PT dashboard.

### PDF export
- Clean layout: program name, PT branding (logo/name), per-workout tables (exercise, sets × reps, rest, notes), exercise thumbnail images optional.
- Generated server-side; shareable via link or download.

---

## Suggested tech stack (adjust to preference)
- **Mobile app**: React Native + Expo (single codebase iOS/Android). Client app must feel fast and minimal.
- **Backend**: Supabase (Postgres + Auth + Storage + Row Level Security) — RLS is a natural fit for the PT/client permission model. Alternatively Node/NestJS + Postgres if more control needed.
- **Auth**: email + Apple/Google sign-in. Role (trainer/client) stored on profile, chosen at signup, changeable in settings.
- **Push notifications**: Expo Notifications (expiry warnings, new program assigned, PT comment).
- **PDF generation**: server-side (e.g. Puppeteer/`react-pdf` in an edge function or small service).
- **Image/video storage**: Supabase Storage or S3; physique photos in a private bucket with signed URLs.

---

## Data model (first pass)

```
users            id, email, role (trainer|client), name, avatar, units, created_at
trainer_clients  trainer_id, client_id, status (invited|active|ended), started_at, ended_at
exercises        id, name, source (seed|custom), owner_id (null for seed), muscles[], equipment,
                 level, instructions[], media_urls[], created_at
programs         id, trainer_id, name, description, created_at
program_workouts id, program_id, name, order, day_label
workout_exercises id, program_workout_id, exercise_id, order, target_sets, target_reps,
                 target_weight_note, rest_seconds, notes
assignments      id, program_id, trainer_id, client_id, starts_at, expires_at,
                 expiry_policy (remove|archive|auto_pdf|archive_and_pdf), status (active|expired|archived)
workout_logs     id, client_id, assignment_id (nullable for solo workouts),
                 program_workout_id (nullable), performed_at, duration, notes
set_logs         id, workout_log_id, exercise_id, set_number, weight, reps, rpe, note
comments         id, workout_log_id (or assignment_id), author_id, body, created_at
physique_entries id, client_id, photo_url, weight, measurements(jsonb), taken_at,
                 shared_with_trainer (bool)
notifications    id, user_id, type, payload(jsonb), read, created_at
```

Access rules (enforce with RLS):
- Client reads program content only via an active (or archived-policy) assignment.
- Trainer reads a client's workout_logs/set_logs only while relationship exists or existed during the assignment window.
- Physique entries readable by trainer only when `shared_with_trainer = true` AND relationship active.
- Client's own logs: always readable/writable by the client, never deleted by expiry.

---

## MVP scope (build in this order)
1. Auth + role selection at signup; trainer↔client invite/connect flow.
2. Exercise library seeded from Free Exercise DB + custom exercise creation.
3. PT: build a workout/program. Client: view assigned program.
4. Client workout logging (sets/weight/reps, previous values, rest timer).
5. Assignment expiry (duration, policies, PT pre-expiry notification).
6. PT client dashboard: history vault + adherence overview.
7. PDF export.
8. Comments/RPE feedback loop.
9. Physique photo log + progress charts.
10. Solo mode polish (client self-created workouts).

## Post-MVP ideas
- Program templates marketplace for PTs.
- In-app payments/subscriptions between client and PT.
- Apple Health / Google Fit sync.
- Video form-check uploads from client to PT.
- Web dashboard for PTs (program building is nicer on desktop).

## Monetization (decided)
Clients always free — their access is covered by their PT's subscription. PTs subscribe on tiers by active client count:
- Free: up to 2 clients (trial/hobby tier)
- Tier 1: up to 5 clients
- Tier 2: up to 10 clients
- Tier 3: up to 25 clients
- Tier 4: unlimited
Exact prices TBD; this aligns cost with who earns revenue from the app. Solo-mode clients (no PT) are free users too.

## Name (decided)
**PTgo** — no App Store collisions found, instantly searchable ("PT" in phone search), self-describing. TODO: run a trademark check (UK/EU/US, software & fitness classes) before launch. Backups considered: Spotter (crowded on App Store), RepSync, Handoff.

---

## Design system

The app should feel calm, minimal, and fast — closer to a well-made tool than a gamified fitness app. Reference feel: Hevy's simplicity with more whitespace. These rules apply to both the client and PT apps and to PDF exports.

### Principles
- One primary action per screen (e.g. "Start workout", "Assign to client"), rendered as the single filled button. Everything else is outline or ghost.
- Colour encodes meaning only, never decoration: green = on track / completed set, amber = expiring / attention, red = at risk / pain flag, blue = messages & informational accents. Neutral gray everywhere else.
- Flat surfaces: no gradients, no drop shadows, no glassmorphism. Hierarchy comes from background tone steps and hairline borders.
- Client screens are sparser than PT screens. The client app should be usable mid-set with sweaty hands: big tap targets (min 44px), one big button, minimal text. The PT app may be denser (rosters, builder) but follows the same tokens.
- Sentence case everywhere. No exclamation marks in system copy. No emoji in UI chrome.

### Tokens
- **Type**: single sans-serif family (system font or Inter). Sizes: 20px screen titles, 16-17px card titles, 14px body, 12-13px secondary, 11px metadata. Weights: 400 regular and 500 medium only — never 600/700.
- **Color roles** (define as theme tokens, support light + dark from day one):
  - surface-0 page background, surface-1 inset cards/stat tiles, surface-2 elevated cards
  - text-primary, text-secondary, text-muted
  - border hairline (0.5-1px), border-strong for inputs
  - semantic pairs, each a pale background + dark text of the same hue: success (green), warning (amber), danger (red), accent (blue), plus one extra categorical hue (purple) for badges like "Superset"
  - fill-primary: near-black in light mode / near-white in dark mode, used for THE primary button and selected pills
- **Shape**: 8px radius for controls and inputs, 12px for cards, 16px+ only for pill chips and avatars. No rounded corners on single-side accents.
- **Spacing**: 4px base grid; card padding 12-16px; 18-20px screen gutters.
- **Icons**: one outline icon set throughout (e.g. Tabler or Lucide outline), 16-20px inline, never filled variants mixed with outline.

### Recurring components
- **Stat tile**: surface-1 background, no border, 11-12px muted label above an 18-24px medium number. Used in 2-3 column grids (weekly progress, PT overview counts).
- **List row**: 0.5px bordered container, rows divided by hairlines (not individual cards), leading icon or avatar, trailing chevron/metric. Used for menus, client rosters, exercise lists.
- **Attention banner**: pale semantic background + matching dark text + leading icon, with inline action buttons (e.g. amber expiry banner with "Program next block" / "Extend").
- **Set row** (logging screen): grid of set number / previous (ghost, muted) / weight / reps / check. Completed sets get a green check chip; previous session's values render as muted placeholders in the inputs.
- **Coach note**: pale blue chip with message icon, attached to an exercise; authored in the builder, displayed on the client's logging screen.
- **Feedback bar**: four equal segmented options — Easy / Solid / Tough / Pain. "Pain" triggers an immediate push notification to the PT; the others sync silently.
- **Day pills** (builder): horizontally scrollable pill row for workouts in a block; selected pill uses fill-primary, "+" pill dashed border.
- **Avatar**: initials on a pale semantic-hue circle; assign hues deterministically per user.

### Screen blueprints (match the approved mockups)
1. **Client home**: greeting header + avatar → today's workout card (program context line, week badge, title, meta, full-width Start button) → 2-col stat tiles → grouped list rows (progress charts, physique log, messages with unread badge) → footer line showing plan expiry date and PT name.
2. **Logging screen**: back + workout title/elapsed timer → exercise header (thumbnail, name, prescription, info icon) → optional coach note chip → set rows grid → rest timer card (mono digits, −15s/+15s) → feedback bar.
3. **PT dashboard**: header + Invite button → 3-col overview tiles (active / expiring / comments) → "Needs attention" stack (amber expiry banner with actions, blue comment banner) → "All clients" list rows with avatar, program progress + last-workout recency, trailing adherence % coloured by threshold (≥80 green, 50-79 amber, <50 red).
4. **Program builder**: back + program title/meta → day pills → exercise list container (drag handle, name, prescription line, optional coach note, superset badge, edit icon, trailing "Add exercise" row) → exercise search field → footer actions: outline "Export PDF" + filled "Assign to client", with hint that assigning sets duration and expiry policy.

### PDF export styling
Same design language: PT logo/name header, program title, per-workout tables (exercise / sets × reps / rest / notes), generous margins, gray hairline table rules, no colour except the PT's logo. Must print cleanly in black and white.

## Non-goals for v1
- Nutrition tracking, wearables, social feed, cardio/GPS tracking.
