-- =============================================================================
-- Events (Social) onboarding: save everything in one call.
--
-- The app calls  supabase.rpc('save_event_preferences', {...})  when the
-- student taps "Save". Doing it in one database function means the interests,
-- optional clubs/tags, campus + format and the "onboarded" flag are all saved
-- together, or not at all (no half-finished onboarding if the network drops).
--
-- SECURITY INVOKER: runs as the signed-in student, so the normal Row Level
-- Security policies still apply. It only ever touches auth.uid()'s rows.
-- =============================================================================

create or replace function public.save_event_preferences(
  p_interest_ids     smallint[],
  p_tag_ids          smallint[] default '{}',
  p_preferred_campus text       default null,
  p_event_format     text       default 'both'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'You need to be logged in' using errcode = '28000';
  end if;

  -- Interests (required: at least one real interest)
  delete from public.user_interests where user_id = v_uid;

  insert into public.user_interests (user_id, interest_id)
  select v_uid, i.id
  from public.interests i
  where i.id = any (coalesce(p_interest_ids, '{}'));

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Choose at least one interest' using errcode = '22023';
  end if;

  -- Clubs & groups (optional). Hidden tags (campus / format) can't be picked.
  delete from public.user_event_tags where user_id = v_uid;

  insert into public.user_event_tags (user_id, tag_id)
  select v_uid, t.id
  from public.event_tags t
  where t.is_selectable
    and t.id = any (coalesce(p_tag_ids, '{}'));

  -- Campus (optional) + in person / online / both
  insert into public.event_preferences (user_id, preferred_campus, event_format)
  values (v_uid, nullif(trim(p_preferred_campus), ''), coalesce(p_event_format, 'both'))
  on conflict (user_id) do update
    set preferred_campus = excluded.preferred_campus,
        event_format     = excluded.event_format;

  -- Mark onboarding done (kept as the first time, if they edit later).
  update public.profiles
  set events_onboarded_at = coalesce(events_onboarded_at, now())
  where id = v_uid;
end;
$$;

revoke all on function public.save_event_preferences(smallint[], smallint[], text, text) from public, anon;
grant execute on function public.save_event_preferences(smallint[], smallint[], text, text) to authenticated;
