// Academics data: read straight from Supabase (Row Level Security limits each
// student to their own rows) and ask the backend for anything that needs
// Canvas or the AI.
import { apiPost } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type EntryKind = 'class' | 'event' | 'assignment' | 'study' | 'commitment';

export type CalendarEntry = {
  id: string;
  kind: EntryKind;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location?: string | null;
  course?: string | null;
  createdBy?: 'ai' | 'user';
};

export type Todo = {
  id: string;
  title: string;
  notes: string | null;
  due: Date | null;
  priority: 1 | 2 | 3;
  isDone: boolean;
  source: 'auto' | 'manual';
  estimatedMinutes: number | null;
};

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

const d = (v: string | null) => (v ? new Date(v) : null);

/** Everything on the calendar between two times, sorted by start. */
export async function getEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
  const [items, blocks] = await Promise.all([
    supabase
      .from('calendar_items')
      .select('id, item_type, title, course_name, location, starts_at, ends_at, all_day')
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at')
      .limit(1000),
    supabase
      .from('schedule_blocks')
      .select('id, block_type, created_by, title, starts_at, ends_at')
      .lt('starts_at', to.toISOString())
      .gt('ends_at', from.toISOString())
      .order('starts_at')
      .limit(1000),
  ]);
  if (items.error) throw items.error;
  if (blocks.error) throw blocks.error;

  const entries: CalendarEntry[] = [
    ...items.data.map((r) => ({
      id: r.id,
      kind: r.item_type as EntryKind,
      title: r.title,
      course: r.course_name,
      location: r.location,
      start: new Date(r.starts_at),
      end: d(r.ends_at),
      allDay: r.all_day,
    })),
    ...blocks.data.map((r) => ({
      id: r.id,
      kind: r.block_type as EntryKind,
      title: r.title,
      start: new Date(r.starts_at),
      end: new Date(r.ends_at),
      allDay: false,
      createdBy: r.created_by as 'ai' | 'user',
    })),
  ];
  return entries.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function getTodos(): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('id, title, notes, due_at, priority, is_done, source, estimated_minutes')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    due: d(r.due_at),
    priority: r.priority as 1 | 2 | 3,
    isDone: r.is_done,
    source: r.source as 'auto' | 'manual',
    estimatedMinutes: r.estimated_minutes,
  }));
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Not logged in');
  return data.session.user.id;
}

export async function setTodoDone(id: string, isDone: boolean) {
  const { error } = await supabase.from('todos').update({ is_done: isDone }).eq('id', id);
  if (error) throw error;
}

export async function addTodo(title: string, due: Date | null) {
  const days = due ? (due.getTime() - Date.now()) / 86_400_000 : Infinity;
  const { error } = await supabase.from('todos').insert({
    user_id: await userId(),
    title,
    due_at: due?.toISOString() ?? null,
    priority: days <= 2 ? 1 : days <= 7 ? 2 : 3,
    source: 'manual',
  });
  if (error) throw error;
}

export async function deleteTodo(id: string) {
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw error;
}

export async function addCommitment(title: string, start: Date, end: Date) {
  const { error } = await supabase.from('schedule_blocks').insert({
    user_id: await userId(),
    block_type: 'commitment',
    created_by: 'user',
    title,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  });
  if (error) throw error;
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
  if (error) throw error;
}

export async function getMessages(): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data as ChatMessage[];
}

// ---- Backend calls -------------------------------------------------------

export type SyncResult = { synced: boolean; replanned: boolean };

export function syncAcademics(token: string, force = false) {
  return apiPost<SyncResult>('/academics/sync', { force }, token);
}

export function replan(token: string) {
  return apiPost<{ study_blocks: number }>('/academics/replan', {}, token);
}

export function askAssistant(token: string, message: string) {
  return apiPost<{ reply: string; added_commitments: number; schedule_changed: boolean }>(
    '/academics/assistant',
    { message },
    token,
  );
}
