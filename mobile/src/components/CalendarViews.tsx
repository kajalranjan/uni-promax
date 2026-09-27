import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CalendarEntry } from '@/lib/academics';
import { addDays, formatTime, sameDay, startOfDay, weekdayName } from '@/lib/dates';
import { colors, kindColors, spacing } from '@/theme';

const FIRST_HOUR = 6;
const LAST_HOUR = 24;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

type Placed = { entry: CalendarEntry; top: number; height: number; lane: number; lanes: number };

/** Minutes since FIRST_HOUR on the entry's day, clamped to the visible range. */
function minutesFromTop(d: Date, day: Date) {
  const mins = (d.getTime() - startOfDay(day).getTime()) / 60000 - FIRST_HOUR * 60;
  return Math.max(0, Math.min(mins, (LAST_HOUR - FIRST_HOUR) * 60));
}

/** Timed entries on one day, laid out side by side when they overlap. */
function layoutDay(entries: CalendarEntry[], day: Date, hourHeight: number): Placed[] {
  const timed = entries
    .filter((e) => !e.allDay && e.kind !== 'assignment' && e.end && sameDay(e.start, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || (b.end!.getTime() - a.end!.getTime()));
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    const lanes = laneEnds.length;
    cluster.forEach((p) => (p.lanes = lanes));
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const e of timed) {
    const s = e.start.getTime();
    const end = e.end!.getTime();
    if (cluster.length && s >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((t) => t <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    clusterEnd = Math.max(clusterEnd, end);
    const top = (minutesFromTop(e.start, day) / 60) * hourHeight;
    const bottom = (minutesFromTop(e.end!, day) / 60) * hourHeight;
    cluster.push({ entry: e, top, height: Math.max(bottom - top, 18), lane, lanes: 1 });
  }
  closeCluster();
  return placed;
}

function hourLabel(h: number) {
  if (h === 12) return '12 PM';
  if (h === 24 || h === 0) return '12 AM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------

type ViewProps = { entries: CalendarEntry[]; onPressEntry: (e: CalendarEntry) => void };

function AllDayChips({ entries, day, compact }: { entries: CalendarEntry[]; day: Date; compact?: boolean }) {
  const items = entries.filter((e) => (e.allDay || e.kind === 'assignment') && sameDay(e.start, day));
  if (!items.length) return null;
  return (
    <View style={{ gap: 3 }}>
      {items.slice(0, compact ? 2 : 20).map((e) => {
        const c = kindColors[e.kind];
        return (
          <View key={e.id} style={[styles.chip, { backgroundColor: c.fill, borderLeftColor: c.edge }]}>
            <Text numberOfLines={1} style={[styles.chipText, { color: c.text }, compact && { fontSize: 10 }]}>
              {e.kind === 'assignment' && !compact ? `Due ${formatTime(e.start)} · ` : ''}{e.title}
            </Text>
          </View>
        );
      })}
      {compact && items.length > 2 && <Text style={styles.more}>+{items.length - 2}</Text>}
    </View>
  );
}

function EventBlock({ p, onPress, compact }: { p: Placed; onPress: () => void; compact?: boolean }) {
  const c = kindColors[p.entry.kind];
  const width = `${100 / p.lanes}%` as const;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${c.label}: ${p.entry.title}, ${formatTime(p.entry.start)}`}
      style={[
        styles.block,
        { top: p.top, height: p.height - 2, left: `${(100 / p.lanes) * p.lane}%`, width,
          backgroundColor: c.fill, borderLeftColor: c.edge },
      ]}>
      <Text numberOfLines={compact ? 3 : 2} style={[styles.blockTitle, { color: c.text }, compact && styles.compactTitle]}>
        {p.entry.title}
      </Text>
      {!compact && p.height > 38 && (
        <Text numberOfLines={1} style={[styles.blockTime, { color: c.text }]}>
          {formatTime(p.entry.start)}{p.entry.location ? ` · ${p.entry.location}` : ''}
        </Text>
      )}
    </Pressable>
  );
}

function HourGrid({ hourHeight, gutter }: { hourHeight: number; gutter: number }) {
  return (
    <>
      {HOURS.map((h, i) => (
        <View key={h} style={[styles.hourRow, { top: i * hourHeight, left: 0, right: 0 }]}>
          <Text style={[styles.hourText, { width: gutter }]}>{hourLabel(h)}</Text>
          <View style={styles.hourLine} />
        </View>
      ))}
    </>
  );
}

function NowLine({ day, hourHeight, now }: { day: Date; hourHeight: number; now: Date }) {
  if (!sameDay(day, now)) return null;
  const top = (minutesFromTop(now, day) / 60) * hourHeight;
  return (
    <View pointerEvents="none" style={[styles.nowLine, { top }]}>
      <View style={styles.nowDot} />
    </View>
  );
}

function useInitialScroll(hourHeight: number) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const h = Math.max(new Date().getHours() - 1, 7);
    const t = setTimeout(() => ref.current?.scrollTo({ y: (h - FIRST_HOUR) * hourHeight, animated: false }), 50);
    return () => clearTimeout(t);
  }, [hourHeight]);
  return ref;
}

// ---------------------------------------------------------------------------

export function DayView({ day, entries, onPressEntry }: ViewProps & { day: Date }) {
  const hourHeight = 60;
  const gutter = 52;
  const now = useNow();
  const placed = useMemo(() => layoutDay(entries, day, hourHeight), [entries, day]);
  const scrollRef = useInitialScroll(hourHeight);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.allDay, { paddingLeft: gutter }]}>
        <AllDayChips entries={entries} day={day} />
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        <View style={{ height: HOURS.length * hourHeight + 12, marginTop: 8 }}>
          <HourGrid hourHeight={hourHeight} gutter={gutter} />
          <View style={[StyleSheet.absoluteFill, { left: gutter + 4, right: 8 }]}>
            {placed.map((p) => (
              <EventBlock key={p.entry.id} p={p} onPress={() => onPressEntry(p.entry)} />
            ))}
            <NowLine day={day} hourHeight={hourHeight} now={now} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function WeekView({ weekStart, entries, onPressEntry, onPressDay }:
  ViewProps & { weekStart: Date; onPressDay: (d: Date) => void }) {
  const hourHeight = 48;
  const gutter = 40;
  const now = useNow();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const scrollRef = useInitialScroll(hourHeight);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.weekHeader, { paddingLeft: gutter }]}>
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <Pressable key={d.toISOString()} style={styles.weekDay} onPress={() => onPressDay(d)}
              accessibilityRole="button" accessibilityLabel={`Open ${weekdayName(d)}`}>
              <Text style={[styles.weekDayName, today && { color: colors.primary }]}>{weekdayName(d, true)}</Text>
              <View style={[styles.weekDateCircle, today && { backgroundColor: colors.primary }]}>
                <Text style={[styles.weekDate, today && { color: '#fff' }]}>{d.getDate()}</Text>
              </View>
              <AllDayChips entries={entries} day={d} compact />
            </Pressable>
          );
        })}
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        <View style={{ height: HOURS.length * hourHeight + 12, marginTop: 8 }}>
          <HourGrid hourHeight={hourHeight} gutter={gutter} />
          <View style={[StyleSheet.absoluteFill, { left: gutter, flexDirection: 'row' }]}>
            {days.map((d) => (
              <View key={d.toISOString()} style={styles.weekColumn}>
                {layoutDay(entries, d, hourHeight).map((p) => (
                  <EventBlock key={p.entry.id} p={p} compact onPress={() => onPressEntry(p.entry)} />
                ))}
                <NowLine day={d} hourHeight={hourHeight} now={now} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function Legend() {
  const kinds = ['class', 'study', 'commitment', 'assignment'] as const;
  return (
    <View style={styles.legend}>
      {kinds.map((k) => (
        <View key={k} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: kindColors[k].fill, borderColor: kindColors[k].edge }]} />
          <Text style={styles.legendText}>{kindColors[k].label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  allDay: { paddingRight: 8, paddingVertical: 6, minHeight: 8 },
  chip: { borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '600' },
  more: { fontSize: 10, color: colors.muted, textAlign: 'center' },
  hourRow: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-start', height: 1 },
  hourText: { fontSize: 11, color: colors.muted, textAlign: 'right', paddingRight: 6, marginTop: -7 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  block: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    overflow: 'hidden',
    marginRight: 2,
  },
  blockTitle: { fontSize: 13, fontWeight: '700' },
  compactTitle: { fontSize: 10, fontWeight: '600' },
  blockTime: { fontSize: 11, marginTop: 1 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.error },
  nowDot: { position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  weekHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  weekDay: { flex: 1, alignItems: 'stretch', paddingHorizontal: 1 },
  weekDayName: { fontSize: 11, color: colors.muted, textAlign: 'center', fontWeight: '600' },
  weekDateCircle: { alignSelf: 'center', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginVertical: 2 },
  weekDate: { fontSize: 15, fontWeight: '700', color: colors.text },
  weekColumn: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, borderLeftWidth: 3 },
  legendText: { fontSize: 12, color: colors.muted },
});
