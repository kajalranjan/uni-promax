-- =============================================================================
-- Campus events from Sun Devil Central
--  * is_hybrid: event is both in person and online (counts for either preference)
--  * the Sun Devil Central school-wide .ics feed as the first event source.
--    The backend imports it every ~30 minutes (see backend/app/events_sync.py).
--    More feeds (e.g. one club's calendar) can be added as extra rows.
-- =============================================================================

alter table public.campus_events
  add column if not exists is_hybrid boolean not null default false;

insert into public.event_sources (name, ics_url)
values ('Sun Devil Central (all events)',
        'https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_arizonau.ics')
on conflict (ics_url) do nothing;
