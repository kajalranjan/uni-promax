// Data helpers for the Social (Events) section.
// Everything here talks to Supabase directly; Row Level Security makes sure a
// student only reads and writes their own preferences.

import { apiGet } from '@/lib/api';
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

// ---------------------------------------------------------------------------
// Events today (from our backend, which imports Sun Devil Central's .ics feed)

export type CampusEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string; // ISO time
  ends_at: string | null;
  campus: string | null;
  is_online: boolean;
  is_hybrid: boolean;
  event_url: string | null;
  matched: string[]; // which of the student's interests / clubs it matched
};

export type EventsTodayResponse = { date: string; events: CampusEvent[]; onboarded: boolean };

export function fetchEventsToday(accessToken: string): Promise<EventsTodayResponse> {
  return apiGet<EventsTodayResponse>('/events/today', accessToken);
}

// ASU is in Arizona (no daylight saving: always UTC-7), so we format times
// ourselves instead of relying on the phone's time zone.
const AZ_OFFSET_MS = -7 * 60 * 60 * 1000;

function azTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + AZ_OFFSET_MS);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatEventTime(e: Pick<CampusEvent, 'starts_at' | 'ends_at'>): string {
  const start = new Date(e.starts_at).getTime();
  const end = e.ends_at ? new Date(e.ends_at).getTime() : null;
  if (end && end - start >= 23 * 60 * 60 * 1000) return 'All day';
  return end ? `${azTime(e.starts_at)} – ${azTime(e.ends_at!)}` : azTime(e.starts_at);
}

export function formatToday(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const weekday = days[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${months[m - 1]} ${d}`;
}

export function eventPlace(e: Pick<CampusEvent, 'campus' | 'is_online' | 'is_hybrid'>): string | null {
  if (e.is_online) return 'Online';
  if (e.is_hybrid) return e.campus ? `${e.campus} + online` : 'In person + online';
  return e.campus;
}
