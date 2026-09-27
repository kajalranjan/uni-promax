// Date helpers. Times are shown in the phone's local time zone
// (Arizona for ASU students; the backend plans in America/Phoenix).

export const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday of the week containing d. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7;
  return addDays(x, -offset);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function weekdayName(d: Date, short = false): string {
  const n = WEEKDAYS[d.getDay()];
  return short ? n.slice(0, 3) : n;
}

export function monthName(d: Date, short = false): string {
  const n = MONTHS[d.getMonth()];
  return short ? n.slice(0, 3) : n;
}

export function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatRange(start: Date, end: Date | null): string {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

/** "Today", "Tomorrow", "Wed, Oct 1" */
export function formatDay(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, addDays(now, 1))) return 'Tomorrow';
  if (sameDay(d, addDays(now, -1))) return 'Yesterday';
  return `${weekdayName(d, true)}, ${monthName(d, true)} ${d.getDate()}`;
}

/** "Due today 11:59 PM", "Due in 3 days", "Overdue" */
export function formatDue(due: Date, now = new Date()): string {
  if (due.getTime() < now.getTime()) return 'Overdue';
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (days === 0) return `Due today ${formatTime(due)}`;
  if (days === 1) return `Due tomorrow ${formatTime(due)}`;
  if (days < 7) return `Due ${weekdayName(due)} ${formatTime(due)}`;
  return `Due ${monthName(due, true)} ${due.getDate()}`;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
