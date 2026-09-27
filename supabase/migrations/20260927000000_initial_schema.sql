-- =============================================================================
-- Uni Promax — initial schema
-- Tables for: student accounts, Academics (calendar, to-dos, AI schedule, AI chat)
-- and Events (interests, clubs/tags, preferences, campus events).
-- Interest and tag lists come from Sun Devil Central (Event Types / Event Tags).
-- Passwords are NOT stored here: Supabase Auth (auth.users) handles them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ACCOUNTS
-- ---------------------------------------------------------------------------

-- One row per student, linked 1:1 to their Supabase Auth user.
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  full_name              text not null check (char_length(trim(full_name)) > 0),
  major                  text,
  age                    smallint check (age between 13 and 120),
  email                  text not null,
  username               text not null
                           check (char_length(username) >= 3)
                           check (username ~ '^[A-Za-z0-9_.]+$'),
  academics_onboarded_at timestamptz,   -- null until Academics onboarding is finished
  events_onboarded_at    timestamptz,   -- null until Events onboarding is finished
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Usernames are unique regardless of capitalization ("Sparky" = "sparky").
create unique index profiles_username_unique on public.profiles (lower(username));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- When someone signs up (supabase.auth.signUp with options.data = {full_name, major, age, username}),
-- automatically create their profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, major, age, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'major',
    nullif(new.raw_user_meta_data ->> 'age', '')::smallint,
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up screen check a username before submitting.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select char_length(p_username) >= 3
     and p_username ~ '^[A-Za-z0-9_.]+$'
     and not exists (
       select 1 from public.profiles where lower(username) = lower(p_username)
     );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ACADEMICS
-- ---------------------------------------------------------------------------

-- What the student gives during Academics onboarding.
create table public.academic_settings (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  canvas_ics_url        text,          -- private feed URL (contains a secret token)
  class_schedule_file   text,          -- storage path of the uploaded class-schedule .ics
  learning_style        text,          -- optional, used by the AI
  time_management_style text,          -- optional, used by the AI
  semester_goals        text,          -- optional, used by the AI
  canvas_last_synced_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger academic_settings_set_updated_at
  before update on public.academic_settings
  for each row execute function public.set_updated_at();

-- Everything imported from the two .ics sources: class meetings, Canvas
-- assignments and Canvas calendar events. Recurring classes are stored as
-- one row per meeting so day/week views are simple range queries.
create table public.calendar_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  source       text not null check (source in ('class_schedule', 'canvas')),
  item_type    text not null check (item_type in ('class', 'assignment', 'event')),
  external_uid text not null,          -- UID from the .ics, used to update on re-sync
  course_name  text,
  title        text not null,
  description  text,
  location     text,
  starts_at    timestamptz not null,   -- for assignments: the due time
  ends_at      timestamptz,
  all_day      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, source, external_uid, starts_at)
);

create index calendar_items_user_time on public.calendar_items (user_id, starts_at);

create trigger calendar_items_set_updated_at
  before update on public.calendar_items
  for each row execute function public.set_updated_at();

-- To-do list: auto-generated from assignments, or added by the student.
create table public.todos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  calendar_item_id uuid references public.calendar_items (id) on delete set null,
  title            text not null,
  notes            text,
  due_at           timestamptz,
  priority         smallint not null default 2 check (priority between 1 and 3), -- 1 = high
  is_done          boolean not null default false,
  source           text not null default 'manual' check (source in ('auto', 'manual')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index todos_user_due on public.todos (user_id, is_done, due_at);

create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

-- Time blocks on the calendar that aren't classes:
--   'study'      — the AI's "when to do what" work sessions
--   'commitment' — other things the student tells us about (work shift, gym, ...)
create table public.schedule_blocks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  block_type       text not null check (block_type in ('study', 'commitment')),
  created_by       text not null default 'ai' check (created_by in ('ai', 'user')),
  title            text not null,
  notes            text,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  calendar_item_id uuid references public.calendar_items (id) on delete set null,
  todo_id          uuid references public.todos (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index schedule_blocks_user_time on public.schedule_blocks (user_id, starts_at);

create trigger schedule_blocks_set_updated_at
  before update on public.schedule_blocks
  for each row execute function public.set_updated_at();

-- Chat history with the AI assistant.
create table public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index ai_messages_user_time on public.ai_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- EVENTS
-- ---------------------------------------------------------------------------

-- The interest list students pick from (Sun Devil Central "Event Types").
create table public.interests (
  id   smallint generated always as identity primary key,
  name text not null unique
);

insert into public.interests (name) values
  ('Academic'),
  ('Athletic/Sports'),
  ('Career Workshop'),
  ('Ceremony'),
  ('Community Service'),
  ('Corporate Presentation'),
  ('Cultural'),
  ('Dinner/Gala'),
  ('Educational/Awareness'),
  ('Fundraiser'),
  ('Graduation'),
  ('Job/Volunteer Opportunities'),
  ('Leadership'),
  ('Lecture'),
  ('Luncheon'),
  ('Meeting'),
  ('Mock Interview'),
  ('Office Hours'),
  ('Online Webinar'),
  ('Orientation'),
  ('Social'),
  ('Spiritual'),
  ('Ticket Sales'),
  ('Tour'),
  ('Training'),
  ('Trek'),
  ('Workshop')
on conflict (name) do nothing;

create table public.user_interests (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  interest_id smallint not null references public.interests (id) on delete cascade,
  primary key (user_id, interest_id)
);

-- Optional "clubs & groups" dropdown (Sun Devil Central "Event Tags").
create table public.event_tags (
  id            smallint generated always as identity primary key,
  name          text not null unique,
  -- false = tag is still stored so events can be matched, but it isn't shown
  -- in the onboarding dropdown (campus and in-person/online tags are already
  -- covered by the preferred-campus and event-format questions).
  is_selectable boolean not null default true
);

-- Which tags each student chose (optional).
create table public.user_event_tags (
  user_id uuid     not null references public.profiles (id) on delete cascade,
  tag_id  smallint not null references public.event_tags (id) on delete cascade,
  primary key (user_id, tag_id)
);

insert into public.event_tags (name, is_selectable) values
  ('Accessibility Coalition', true),
  ('Alliance of Indigenous Peoples', true),
  ('Asian/Asian Pacific American Students'' Coalition', true),
  ('ASU Welcome Event', true),
  ('Barrett Student Organization', true),
  ('Black African Coalition', true),
  ('California Events', true),
  ('Career and Professional Development', true),
  ('Change the World', true),
  ('Changemaker Central', true),
  ('Civic Engagement', true),
  ('Club Meetings', true),
  ('Clubs and Organization Workshops', true),
  ('Coalition of International Students', true),
  ('Community Service', true),
  ('Downtown Phoenix Campus', false),
  ('El Concilio', true),
  ('Entrepreneurship & Innovation', true),
  ('Family Weekend', true),
  ('Graduate', true),
  ('Homecoming', true),
  ('Housing - Global Citizenship', true),
  ('Housing - Academic Success & Career Preparedness', true),
  ('Housing - Affinity', true),
  ('Housing - Connectedness', true),
  ('Housing - RCC', true),
  ('Housing - Wellness', true),
  ('Hybrid Event', false),
  ('In-Person Event', false),
  ('Inferno Affinity Alliance', true),
  ('International', true),
  ('IRE Officially Recognized Student Event', true),
  ('Mary Lou Fulton College Events', true),
  ('Multicultural Communities of Excellence', true),
  ('Online Event', false),
  ('PAB Event', true),
  ('Polytechnic Campus', false),
  ('Rainbow Coalition', true),
  ('Salute to Service', true),
  ('Student Organization Event', true),
  ('Sun Devil Athletics', true),
  ('Sun Devil Cinema', true),
  ('Sun Devil Fitness/Wellness', true),
  ('Sun Devil Sport Club', true),
  ('Sun Devils UNITE', true),
  ('Sustainability', true),
  ('Tempe Campus', false),
  ('Thunderbird Events', true),
  ('Training', true),
  ('Undergraduate', true),
  ('University Signature Event', true),
  ('W.P. Carey Event', true),
  ('West Valley Campus', false),
  ('Women''s Coalition', true)
on conflict (name) do nothing;

-- Events onboarding answers.
create table public.event_preferences (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  preferred_campus text check (preferred_campus in
                     ('Tempe', 'Downtown Phoenix', 'Polytechnic', 'West Valley', 'Lake Havasu')),
  event_format     text not null default 'both' check (event_format in ('in_person', 'online', 'both')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger event_preferences_set_updated_at
  before update on public.event_preferences
  for each row execute function public.set_updated_at();

-- The .ics feeds the backend pulls campus events from (managed by the team, not users).
create table public.event_sources (
  id             smallint generated always as identity primary key,
  name           text not null,
  ics_url        text not null unique,
  is_active      boolean not null default true,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now()
);

-- Campus events imported from event_sources.
create table public.campus_events (
  id           uuid primary key default gen_random_uuid(),
  source_id    smallint references public.event_sources (id) on delete set null,
  external_uid text not null unique,
  title        text not null,
  description  text,
  campus       text,
  is_online    boolean not null default false,
  event_url    text,                     -- link to the event on Sun Devil Central
  categories   text[] not null default '{}',
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index campus_events_starts_at on public.campus_events (starts_at);

create trigger campus_events_set_updated_at
  before update on public.campus_events
  for each row execute function public.set_updated_at();

-- Which interests each event matches (filled in by the backend when importing).
create table public.campus_event_interests (
  event_id    uuid not null references public.campus_events (id) on delete cascade,
  interest_id smallint not null references public.interests (id) on delete cascade,
  primary key (event_id, interest_id)
);

create index campus_event_interests_interest on public.campus_event_interests (interest_id);

-- Which tags each imported campus event has (filled in by the backend).
create table public.campus_event_tags (
  event_id uuid     not null references public.campus_events (id) on delete cascade,
  tag_id   smallint not null references public.event_tags (id) on delete cascade,
  primary key (event_id, tag_id)
);

create index campus_event_tags_tag on public.campus_event_tags (tag_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- The mobile app talks to Supabase with the publishable key, so every table
-- has RLS on. Students can only see and change their own rows. The FastAPI
-- backend uses the secret key, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.profiles               enable row level security;
alter table public.academic_settings      enable row level security;
alter table public.calendar_items         enable row level security;
alter table public.todos                  enable row level security;
alter table public.schedule_blocks        enable row level security;
alter table public.ai_messages            enable row level security;
alter table public.interests              enable row level security;
alter table public.user_interests         enable row level security;
alter table public.event_preferences      enable row level security;
alter table public.event_sources          enable row level security;  -- backend only, no policies
alter table public.campus_events          enable row level security;
alter table public.campus_event_interests enable row level security;
alter table public.event_tags             enable row level security;
alter table public.user_event_tags        enable row level security;
alter table public.campus_event_tags      enable row level security;

-- profiles: read/update own (rows are created by the sign-up trigger)
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Own-rows-only policies for the per-student tables
create policy "Own academic settings" on public.academic_settings
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Read own calendar items" on public.calendar_items
  for select to authenticated using ((select auth.uid()) = user_id);
  -- written only by the backend's .ics import

create policy "Own todos" on public.todos
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Own schedule blocks" on public.schedule_blocks
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Read own AI messages" on public.ai_messages
  for select to authenticated using ((select auth.uid()) = user_id);
  -- written only by the backend (it calls the AI provider)

create policy "Own interests" on public.user_interests
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Own event tags" on public.user_event_tags
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Own event preferences" on public.event_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Shared read-only data
create policy "Anyone can read interests" on public.interests
  for select to anon, authenticated using (true);
create policy "Signed-in users can read campus events" on public.campus_events
  for select to authenticated using (true);
create policy "Signed-in users can read event interests" on public.campus_event_interests
  for select to authenticated using (true);
create policy "Anyone can read event tags" on public.event_tags
  for select to anon, authenticated using (true);
create policy "Signed-in users can read campus event tags" on public.campus_event_tags
  for select to authenticated using (true);
