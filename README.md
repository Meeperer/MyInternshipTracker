# Internship Journal Tracker

A full-stack app for students and interns to log daily work, track hours toward a **486-hour** requirement, and produce a reflection report. It combines a Pomodoro timer, a calendar, daily journal entries, and AI-assisted structuring (ARAS) so users can meet program compliance and build a single compiled report for submission.

---

## What it does

- **Tracks internship hours** against a 486-hour target. Progress (total hours, remaining, days completed, streaks) is computed from finished journal days and shown on a dashboard and calendar.
- **Daily journal:** One entry per calendar day. Users log hours and optional free-form notes. A day can be **finished** (locked) so its hours count toward the total and cannot be edited.
- **ARAS reflection:** Each entry can be turned into a structured report (Action, Reflection, Analysis, Summary) via AI (Groq). The AI only restructures existing content; it does not invent facts.
- **AI refine:** Optional grammar and clarity pass on journal text, again without adding or changing meaning.
- **Pomodoro timer:** Configurable work blocks (e.g. 25 / 50 / 90 min) to support focus while working; separate from hour logging (hours are entered in the journal).
- **Compiled report:** Once 486 hours are reached, the user can compile a PDF report (name, company, date range, total hours, and ARAS per entry) for submission to school or employer.
- **Export:** Journal data can be exported as JSON or Markdown for backup or external use.

The app enforces a single target (486 hours) everywhere: database default, server constant, and client fallback. When the user reaches 486 finished hours, new journal entries are blocked and the focus shifts to compiling and downloading the report.

---

## Tech stack

| Layer   | Technology |
|--------|------------|
| Frontend | SvelteKit (Svelte 5), Vite |
| Backend  | Express, Node.js |
| Database | Supabase (PostgreSQL) |
| Auth     | Supabase Auth (session via client; API uses Bearer token) |
| AI       | Groq API (Llama 3.1 8B) for refine and ARAS |
| PDF      | PDFKit for compiled report |

**Secrets:** Never commit `.env` or real API keys. Use `server/.env.example` and `client/.env.example` as templates; copy to `.env` and fill in values locally or in your deployment environment.

---

## Project structure

```
Pomodoro/
├── client/                 # SvelteKit frontend
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/ # UI (Dashboard, Calendar, DayModal, Timer, JournalList, Nav, etc.)
│   │   │   ├── stores/     # auth, journal, progress, timer, toast
│   │   │   ├── utils/      # api, date helpers
│   │   │   └── constants.js # TARGET_HOURS (486)
│   │   └── routes/         # login, register, dashboard, calendar, pomodoro, journal, 404, error
│   └── static/fonts/       # Recoleta, Moonshine, Aileron (.otf)
├── api/                    # Vercel serverless: catch-all /api/* → Express (api/[[...path]].js)
├── server/                 # Express API (app.js exportable for serverless; index.js runs locally)
│   ├── routes/             # auth, journals, progress, ai, compilation
│   ├── middleware/         # requireAuth, validation (journal entry, date, hours)
│   ├── services/           # supabase, groq, pdf
│   └── scripts/            # health-check.js (smoke test for /api/health)
├── shared/
│   └── constants.js        # TARGET_HOURS (486) used by server
└── supabase/
    ├── schema.sql          # profiles, journals, internship_progress, ai_logs, compiled_reports, RLS, triggers
    └── migrations/         # 001 finish_journal_day, 002 target_hours_486
```

---

## Main flows

1. **Auth:** Register or log in; session stored client-side. API calls use a Bearer token; refresh is used when the token expires.
2. **Progress:** Fetched from `internship_progress` (and derived from finished journal rows). Triggers recalculate total hours, days, and streaks when a journal row is inserted/updated/deleted.
3. **Journal:** List by month; open a date in the day modal to view, add, or edit. Save (draft) or **Finish day** (lock). Finish day runs a DB function that sets status to `finished` and triggers progress recalculation.
4. **AI:** Refine and ARAS call Groq with strict prompts: no fabrication, only restructure or polish existing text. Results are stored on the journal row and included in the compiled PDF.
5. **Compilation:** When total hours ≥ 486, the user can compile a report (date range, all finished entries with ARAS) and download it as PDF.

---

## API overview

| Area        | Purpose |
|------------|---------|
| `POST /api/auth/register`, `login`, `refresh`, `GET /api/auth/me` | Account and profile |
| `GET/POST /api/journals`, `POST /api/journals/log-hours`, `POST /api/journals/finish-day` | Journal CRUD and lock |
| `GET /api/progress` | Progress stats (hours, streak, target) |
| `POST /api/ai/refine`, `POST /api/ai/aras` | AI refine and ARAS |
| `GET /api/compilation/status`, `POST /api/compilation/compile`, `GET /api/compilation/download` | Report eligibility, compile, PDF download |
| `GET /api/health` | Health check (status, Supabase connectivity) |

All authenticated routes use `Authorization: Bearer <access_token>`. Journal and progress data are scoped by `user_id`; RLS and API enforce per-user access.

---

## 486-hour compliance

- **Target:** 486 hours (defined in `shared/constants.js` and `client/src/lib/constants.js`; DB default in `profiles.target_hours` and in `recalculate_progress()`).
- **Counting:** Only **finished** journal days contribute. Draft entries do not.
- **When reached:** New journal entries are disabled; the user can only compile and download the report.
- **Report:** PDF includes name, company, date range, total hours, and each finished entry’s ARAS sections.

---

## AI behavior

- **Refine:** Improves grammar, spelling, and clarity. Does not add, remove, or invent content.
- **ARAS:** Fills Action, Reflection, Analysis, Summary only from the user’s text. If something is missing, the output stays minimal rather than invented.
- Prompts and timeouts are set so the API assists structure and clarity without hallucinating.
