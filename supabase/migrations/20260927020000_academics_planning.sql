-- =============================================================================
-- Academics planning: fields the AI study planner needs
-- =============================================================================

-- The AI's estimate for each to-do (filled in by the backend).
alter table public.todos
  add column estimated_minutes smallint check (estimated_minutes > 0),   -- total work needed
  add column session_minutes   smallint check (session_minutes > 0),     -- length of one sitting
  add column start_days_before smallint check (start_days_before >= 0);  -- how early to start

-- At most one automatic to-do per Canvas assignment.
create unique index todos_one_per_calendar_item
  on public.todos (calendar_item_id) where calendar_item_id is not null;

-- Study preferences (from the AI, based on the student's onboarding answers)
-- and when the plan was last rebuilt.
alter table public.academic_settings
  add column study_day_start_hour      smallint not null default 9  check (study_day_start_hour between 0 and 23),
  add column study_day_end_hour        smallint not null default 22 check (study_day_end_hour between 1 and 24),
  add column max_study_minutes_per_day smallint not null default 240 check (max_study_minutes_per_day > 0),
  add column plan_generated_at         timestamptz;
