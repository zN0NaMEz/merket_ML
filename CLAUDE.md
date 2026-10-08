# CLAUDE.md

## AI behind-the-scenes view
- Read docs/ai-behind-the-scenes-roadmap.md before working on /ai/behind (RodeMap.md now holds the current UI plan).
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
  Random Forest explanations use shap.TreeExplainer (pinned in ml/requirements.txt with numba/llvmlite, imported lazily,
  ~75 MB extra RSS); if shap cannot load, explain() falls back to tree_path, then to global permutation importance.
- Web: page web/src/pages/ai/*, pure logic web/src/ai/*.js (tested with node --test), styles web/src/styles/behind.css.
- Roles: staff, owner, admin (ทีม/กรรมการ). Vendors must never see risk wording ("เสี่ยงสูง") or these pages.
- The status endpoint is public and must stay free of per-user data; the web fetches it without an Authorization header so the CDN can cache it.

- Meter reviews: a confirm/correct is saved immediately; undo is allowed for the same user within 30 s (DB clock) and only
  for the latest effective review; rows are never deleted (undone_at). Bills cannot be issued while an undo is still possible.
- Drift (round 5): ml/app/drift.py computes PSI with adaptive bins, a noise floor and a permutation p-value; the overall level
  counts only p < 0.05. `season` is excluded (calendar-driven); meter ratios compare the same month last year and skip flagged readings.

- Risk models: lr, rf, et, gb, ens (ensemble = mean probability of lr+rf+gb, assembled from fitted members, never refit).
  Keep the lists identical: ml/app/risk.py MODEL_KEYS · api/src/lib/constants.js RISK_MODELS · web/src/ai/behind.js
  RISK_MODELS/MODEL_SHORT/MODEL_PLAIN · MODELS in web/src/pages/shared/AI.jsx. Models trained before a key existed are
  missing until the next retrain: ML /risk/score raises 409 and PUT /ai/settings refuses an untrained model.
  Tree models run single-threaded (risk.N_JOBS = 1, OMP_NUM_THREADS=1 in the Dockerfile): faster on 0.1 CPU, same results.
- Payment-behavior features (features.BEHAVIOR: early_days_avg, seen_rate, app_share) use only what happened before the
  bill's issue_date. bills.seen_at is recorded when a vendor opens GET /vendor/overview (migration v5). Old model sets
  without these columns keep working (risk._cols selects each pipeline's own columns) until the next retrain.
- Demo data profiles (api/src/lib/simBehavior.js, settings.sim): realistic (default) or clear (logit × 3, low chance).
  Chosen in the reset dialog (web/src/components/DemoReset.jsx ResetDialog, used by the owner page and by the staff AI page
  panel web/src/pages/shared/DataProfile.jsx) or via reseed body { profile }. With clear, CLEAR_NOTE sits under every
  accuracy block on the staff AI page (KPIs, model picker, predict-from-file evaluation).
  Realistic accuracy is capped near 0.80 by the data (Bayes ceiling); only clear exceeds 0.90 — never fake it otherwise.
  Behaviors and sharpness must match ml/app/synthetic.py. ML stores metrics.sim_profile; every place that shows quality
  numbers must show the "ข้อมูลจำลอง · ความบังเอิญต่ำ" badge for clear (SynthBadge profile prop, staff AI status line).
  Never present clear-profile numbers as real-market accuracy. Reseeding production still needs the user's confirmation.
- Predict from file (staff AI page, tab "ทำนายจากไฟล์"): the browser parses CSV in web/src/ai/predictFile.js → POST
  /api/ai/predict (api/src/lib/riskInput.js re-validates, same ranges) → ML POST /risk/predict, which converts rows with
  features.input_features() (same definitions as risk_features). Uploaded data is never stored. ML is called only on
  the button press, never on page/tab load.
- Model evaluation on synthetic data: scenarios in ml/app/synthetic.py (fixed seeds), evaluation in ml/app/benchmark.py
  (same split/CV/threshold as production training). Results go to evaluation_batches + model_evaluations (migration v4),
  never to model_runs, and never replace the production models. POST /benchmark/run runs in the background; the admin
  "ทดสอบหลายชุดข้อมูล" tab polls GET /api/ai/evaluations. CSV export + datasheet: ml/data/synthetic/ (excluded from the Docker image).
  Designed scenarios carry `expect` + `hypothesis`; the API judges them with a paired t-test on the shared CV folds
  (|t| ≥ 2.776) or an F1 gap ≥ 0.05 for meters, and reports "unclear" otherwise. Risk hypotheses compare LR vs RF only
  (evaluations.js HYPOTHESIS_MODELS); et/gb/ens appear in the tables but never change a hypothesis verdict. Never tune a scenario until it "wins":
  change parameters only to fix a generator bug or to match the scenario's description, and keep honest "unclear" results.

## UI rules (mobile-first, keep the existing look)
- Read RodeMap.md before UI work (its prompts refer to it as docs/ui-mobile-usability-prompts.md; RodeMap.md is the only copy). The earlier synthetic-data plan is in docs/synthetic-data-and-evaluation-prompts.md.
- Keep the existing palette (cream, ink, bronze) and fonts. Do not add new hues. New tints/shades must be derived from existing colors and declared as tokens first.
- Every text/background pair must meet WCAG contrast: 4.5:1 for normal text, 3:1 for large text and meaningful UI borders/icons. Report the ratio for any new pair.
- Never use color alone to convey status; always pair with text or an icon.
- Touch targets >= 44x44 px; primary inputs and buttons >= 48 px tall.
- At 390 px width there must be no horizontal page scroll. Below 700 px, data tables become cards.
- Mobile text: body 16 px, secondary 14 px, never below 13 px. Numbers use tabular-nums. Phone numbers and amounts never wrap.
- Numeric inputs: type="text" inputmode="decimal" with enterkeyhint; never type="number".
- Do not show internal codes (5.0, D7, XAI) outside presentation mode (?present=1, stored in localStorage; see web/src/present.js).
- Staff pending counts come from GET /api/staff/today (api/src/lib/staffCounts.js); keep its rules identical to web/src/staff/rules.js and the destination pages.
- Destructive actions (utility cut) need a confirmation dialog that states the consequence, plus undo via toast.
- Every design decision cites its source ID from RodeMap.md section 9.
- Definition of done per round: `cd web && UI_BASE_URL=... npm run test:ui` (Playwright + axe, section 6) passes at 390x844, with before/after screenshots at 390 px and 1280 px.

## Tests
- api: `cd api && npm test` · web: `cd web && npm test` · ml: `cd ml && python -m unittest discover -s tests -v`
- api integration (test DB only, needs flagged meter drafts in the current period):
  `cd api && AI_IT_URL=http://localhost:4000/api npm run test:integration`

## Working agreements
- Never print secrets (DB URLs, ML_API_KEY, reseed key, tokens). They live in gitignored *.local.txt / .env.local files.
- Do not commit, push or deploy unless asked. Never run destructive actions (reseed, truncation) against production without confirmation.
