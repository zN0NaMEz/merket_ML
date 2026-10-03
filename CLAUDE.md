# CLAUDE.md

## AI behind-the-scenes view
- Read RodeMap.md (repo root) before working on /ai/behind.
- Pages under /ai/behind must read from Postgres via /api/ai/*. Never call the ML service on page load.
- Display Thai, user-facing labels for features (web/src/ai/featureLabels.js). Never show raw column names.
- Every metric shown must come from model_runs. Show an empty state if none exist. Never hardcode or simulate metrics.
- Show a "ข้อมูลจำลอง" badge whenever model_runs.is_synthetic is true.
- Definition of done for every round: loading, empty, ML-asleep and error states are fully implemented and manually checked, plus tests for the main logic. Do not start the next round until these are done; list each state and how you verified it.
- GET /api/ai/status is cached at the Vercel CDN (s-maxage=15). Never cache it in function memory.

## Where things live (AI behind view)
- API routes: api/src/routes/ai.js · status ping: api/src/lib/aiStatus.js · schema changes: api/src/lib/migrate.js
  (idempotent, versioned in settings.schema_version, runs lazily before any /api route; bump VERSION for new steps).
- ML: explanations in ml/app/explain.py; training writes model_runs columns via ml/app/db.py save_model_run().
- Web: page web/src/pages/ai/*, pure logic web/src/ai/*.js (tested with node --test), styles web/src/styles/behind.css.
- Roles: staff, owner, admin (ทีม/กรรมการ). Vendors must never see risk wording ("เสี่ยงสูง") or these pages.
- The status endpoint is public and must stay free of per-user data; the web fetches it without an Authorization header so the CDN can cache it.

- Meter reviews: a confirm/correct is saved immediately; undo is allowed for the same user within 30 s (DB clock) and only
  for the latest effective review; rows are never deleted (undone_at). Bills cannot be issued while an undo is still possible.
- Drift (round 5): ml/app/drift.py computes PSI with adaptive bins, a noise floor and a permutation p-value; the overall level
  counts only p < 0.05. `season` is excluded (calendar-driven); meter ratios compare the same month last year and skip flagged readings.

## Tests
- api: `cd api && npm test` · web: `cd web && npm test` · ml: `cd ml && python -m unittest discover -s tests -v`
- api integration (test DB only, needs flagged meter drafts in the current period):
  `cd api && AI_IT_URL=http://localhost:4000/api npm run test:integration`

## Working agreements
- Never print secrets (DB URLs, ML_API_KEY, reseed key, tokens). They live in gitignored *.local.txt / .env.local files.
- Do not commit, push or deploy unless asked. Never run destructive actions (reseed, truncation) against production without confirmation.
