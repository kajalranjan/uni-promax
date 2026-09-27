// Data helpers for the Social (Events) section.
// Everything here talks to Supabase directly; Row Level Security makes sure a
// student only reads and writes their own preferences.

import { supabase } from '@/lib/supabase';

export type Option = { id: number; name: string };

// Must match the check constraint on event_preferences.preferred_campus.
export const CAMPUSES = ['Tempe', 'Downtown Phoenix', 'Polytechnic', 'West Valley', 'Lake Havasu'] as const;
export type Campus = (typeof CAMPUSES)[number];

export const EVENT_FORMATS = [
  { value: 'in_person', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'both', label: 'Both' },
] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number]['value'];

export type EventPreferences = {
  interestIds: number[];
  tagIds: number[];
  preferredCampus: Campus | null;
  eventFormat: EventFormat;
};

export const EMPTY_PREFERENCES: EventPreferences = {
  interestIds: [],
  tagIds: [],
  preferredCampus: null,
  eventFormat: 'both',
};

/** The lists students choose from: interests (required) and clubs/groups (optional). */
export async function loadEventOptions(): Promise<{ interests: Option[]; tags: Option[] }> {
  const [interests, tags] = await Promise.all([
    supabase.from('interests').select('id, name').order('name'),
    supabase.from('event_tags').select('id, name').eq('is_selectable', true).order('name'),
  ]);
  if (interests.error) throw interests.error;
  if (tags.error) throw tags.error;
  return { interests: interests.data ?? [], tags: tags.data ?? [] };
}

/** What this student already saved (empty defaults the first time). */
export async function loadMyEventPreferences(userId: string): Promise<EventPreferences> {
  const [interests, tags, prefs] = await Promise.all([
    supabase.from('user_interests').select('interest_id').eq('user_id', userId),
    supabase.from('user_event_tags').select('tag_id').eq('user_id', userId),
    supabase.from('event_preferences').select('preferred_campus, event_format').eq('user_id', userId).maybeSingle(),
  ]);
  if (interests.error) throw interests.error;
  if (tags.error) throw tags.error;
  if (prefs.error) throw prefs.error;
  return {
    interestIds: (interests.data ?? []).map((r) => r.interest_id),
    tagIds: (tags.data ?? []).map((r) => r.tag_id),
    preferredCampus: (prefs.data?.preferred_campus as Campus | null) ?? null,
    eventFormat: (prefs.data?.event_format as EventFormat | undefined) ?? 'both',
  };
}

/** Saves everything at once and marks Events onboarding as done. */
export async function saveEventPreferences(p: EventPreferences): Promise<void> {
  const { error } = await supabase.rpc('save_event_preferences', {
    p_interest_ids: p.interestIds,
    p_tag_ids: p.tagIds,
    p_preferred_campus: p.preferredCampus,
    p_event_format: p.eventFormat,
  });
  if (error) throw new Error(error.message);
}
