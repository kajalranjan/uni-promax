-- =============================================================================
-- Use Sun Devil Central's real lists for Events onboarding:
--   * interests  = SDC "Event Types"  (required pick during onboarding)
--   * event_tags = SDC "Event Tags"   (optional "clubs & groups" dropdown)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Replace the placeholder interests with SDC Event Types
-- ---------------------------------------------------------------------------
delete from public.interests;   -- placeholders only; no students have picked yet

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

-- ---------------------------------------------------------------------------
-- 2. Event tags (the optional clubs/groups dropdown)
-- ---------------------------------------------------------------------------
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

-- Which tags each imported campus event has (filled in by the backend).
create table public.campus_event_tags (
  event_id uuid     not null references public.campus_events (id) on delete cascade,
  tag_id   smallint not null references public.event_tags (id) on delete cascade,
  primary key (event_id, tag_id)
);

create index campus_event_tags_tag on public.campus_event_tags (tag_id);

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

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.event_tags        enable row level security;
alter table public.user_event_tags   enable row level security;
alter table public.campus_event_tags enable row level security;

create policy "Anyone can read event tags" on public.event_tags
  for select to anon, authenticated using (true);

create policy "Own event tags" on public.user_event_tags
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Signed-in users can read campus event tags" on public.campus_event_tags
  for select to authenticated using (true);
