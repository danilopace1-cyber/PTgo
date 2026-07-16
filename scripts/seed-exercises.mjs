// Imports the Free Exercise DB (public domain, ~870 exercises) into the
// exercises table. Idempotent: rows upsert on slug, so re-running refreshes
// the seed without duplicating. Images point at the dataset's GitHub raw
// URLs for now; mirror them to Supabase Storage before production (the spec
// says don't hotlink long-term).
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-exercises.mjs
//
// The service role key bypasses RLS (seed rows have no owner). For local dev
// both values are printed by `npx supabase start` / `npx supabase status`.

import { createClient } from '@supabase/supabase-js';

const DATASET_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see header comment).');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const response = await fetch(`${DATASET_BASE}/dist/exercises.json`);
if (!response.ok) {
  console.error(`Failed to download dataset: HTTP ${response.status}`);
  process.exit(1);
}
const dataset = await response.json();

const rows = dataset.map((exercise) => ({
  slug: exercise.id,
  name: exercise.name,
  source: 'seed',
  owner_id: null,
  level: exercise.level ?? null,
  equipment: exercise.equipment ?? null,
  primary_muscles: exercise.primaryMuscles ?? [],
  secondary_muscles: exercise.secondaryMuscles ?? [],
  instructions: exercise.instructions ?? [],
  images: (exercise.images ?? []).map((path) => `${DATASET_BASE}/exercises/${path}`),
}));

const BATCH = 200;
let imported = 0;
for (let start = 0; start < rows.length; start += BATCH) {
  const batch = rows.slice(start, start + BATCH);
  const { error } = await supabase.from('exercises').upsert(batch, { onConflict: 'slug' });
  if (error) {
    console.error(`Batch at ${start} failed: ${error.message}`);
    process.exit(1);
  }
  imported += batch.length;
}

console.log(`Seeded ${imported} exercises.`);
