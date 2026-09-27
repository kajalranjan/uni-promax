# Uni Promax

A student app for iOS and Android: an **Academics** page (classes, Canvas assignments, to-dos and an AI-built study schedule) and an **Events** page (campus events matched to your interests).

| Part | Tech | Folder |
|---|---|---|
| Mobile app (iOS + Android) | TypeScript, React Native, Expo (Expo Router) | `mobile/` |
| Backend + AI | Python, FastAPI | `backend/` |
| Database + login | Supabase (PostgreSQL + Supabase Auth) | `supabase/` |

```
uni-promax/
├── mobile/                 Expo app — screens live in mobile/src/app/
│   └── src/lib/            supabase.ts (database client), api.ts (calls the backend)
├── backend/                FastAPI server
│   ├── app/main.py         app entry point
│   ├── app/routers/        one file per feature (health.py for now)
│   └── tests/
└── supabase/
    ├── migrations/         database schema — every change is a new file here
    ├── seed.sql            starter interest list
    └── config.toml
```

---

## One-time setup (the project owner does this once)

### 1. Create the Supabase project
1. Go to [supabase.com](https://supabase.com) → **New project**. Name it `uni-promax`, save the database password somewhere safe.
2. Invite your teammate: **Organization settings → Team → Invite**.

### 2. Create the database tables
Either way works; the SQL Editor is the easiest the first time.

**Option A — SQL Editor (no install):**
1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste all of `supabase/migrations/20260927000000_initial_schema.sql` → **Run**.
3. New query → paste `supabase/seed.sql` → **Run**.
4. Check **Table Editor**: you should see `profiles`, `todos`, `interests` (16 rows), etc.

**Option B — Supabase CLI:**
```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF   # the ref is in your project URL
npx supabase db push --include-seed
```

### 3. Auth settings (dashboard → Authentication)
- **Sign In / Providers → Email**: set **Minimum password length** to **8** (matches the spec).
- **Email confirmations**: turn *off* while developing so test accounts work immediately; turn back on before launch.

---

## Every teammate: get it running in VS Code

**Needs:** [Node.js 20+](https://nodejs.org), [Python 3.11+](https://python.org), Git, and the **Expo Go** app on your phone.

```bash
git clone https://github.com/kajalranjan/uni-promax.git
cd uni-promax
code .
```
VS Code will suggest the recommended extensions — install them.

### Keys
Supabase dashboard → **Project Settings → API Keys**. You need the **Project URL**, the **publishable key** (`sb_publishable_…`) and the **secret key** (`sb_secret_…`).

```bash
cp mobile/.env.example mobile/.env      # fill in URL + publishable key
cp backend/.env.example backend/.env    # fill in URL + publishable key + secret key
```
`.env` files are git-ignored. **Never commit them, and never put the secret key in the mobile app.** Share keys with your teammate privately (not in GitHub).

### Run the backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
fastapi dev app/main.py --host 0.0.0.0
```
Open http://localhost:8000/health → `{"status":"ok"}`, and http://localhost:8000/health/db → `{"status":"ok","interests":16}`.
Interactive API docs: http://localhost:8000/docs. Tests: `pytest`.

### Run the mobile app
```bash
cd mobile
npm install
npx expo start
```
Scan the QR code with Expo Go (Android) or the Camera app (iPhone). You should see **Welcome to Uni Promax** with **Supabase: ok** and **Backend: ok**.

> On a real phone, `localhost` is the phone itself. Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer's local IP (e.g. `http://192.168.1.20:8000`); same Wi-Fi network required.

Always add mobile packages with `npx expo install <package>` (not `npm install`) so versions match the Expo SDK.

---

## Database overview

| Table | What it holds | Who writes it |
|---|---|---|
| `profiles` | name, major, age, email, username (1 per student) | created automatically at sign-up |
| `academic_settings` | Canvas `.ics` URL, class-schedule file, learning style, time-management style, goals | app |
| `calendar_items` | classes + Canvas assignments/events imported from the `.ics` files | backend |
| `todos` | auto to-dos from assignments + manual ones; `priority` 1 = high | app + backend |
| `schedule_blocks` | AI "when to do what" study blocks + the student's other commitments | app + backend |
| `ai_messages` | AI assistant chat history | backend |
| `interests`, `user_interests` | interest list and each student's picks | app |
| `event_preferences` | preferred ASU campus, in-person / online / both | app |
| `event_sources` | campus-event `.ics` feeds the backend imports | team (dashboard) |
| `campus_events`, `campus_event_interests` | imported events + which interests they match | backend |

**Security:** Row Level Security is on for every table, so a student can only read or change their own rows even though the app talks to Supabase directly. The backend uses the secret key, which bypasses RLS, so backend code must always filter by the logged-in user's id.

**Accounts:** passwords are handled by Supabase Auth, never stored in our tables. Sign-up calls `supabase.auth.signUp({ email, password, options: { data: { full_name, major, age, username } } })` and a trigger creates the profile. `is_username_available('name')` can be called from the sign-up screen. Supabase logs in by email, so **log in with username** will need a small backend endpoint that looks up the email for a username — build that with the login feature.

**Changing the schema:** never edit an existing migration after it has been run. Add a new file:
```bash
npx supabase migration new describe_change   # creates supabase/migrations/<timestamp>_describe_change.sql
```
Write the SQL, commit it, and run it (SQL Editor or `npx supabase db push`). Tell your teammate so they pull it.

---

## Working together on GitHub

- `main` should always run. Don't commit straight to it.
- For each piece of work: `git checkout -b feature/short-name` → commit → `git push -u origin feature/short-name` → open a Pull Request → the other person reviews and merges.
- Start each session with `git checkout main && git pull`, then `git checkout -b …`.
- Pull often; small PRs are easier to review and cause fewer merge conflicts.
