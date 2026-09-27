import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import {
  eventPlace,
  fetchEventsToday,
  formatEventTime,
  formatToday,
  type CampusEvent,
  type EventsTodayResponse,
} from '@/lib/events';
import { colors, spacing } from '@/theme';

const SDC_EVENTS = 'https://sundevilcentral.eoss.asu.edu/events';

// "Events today": campus events from Sun Devil Central that match the
// student's interests, clubs, campus and in-person/online choice.
// Tap a bubble to see the details.
export function EventsToday() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [data, setData] = useState<EventsTodayResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      setData(await fetchEventsToday(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong, try again');
    }
  }, [token]);

  // Reload whenever this screen comes into view (e.g. back from Preferences).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: spacing.md }]}>Finding events for you…</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error}</Text>
        <Button title="Try again" variant="secondary" onPress={load} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={data.events}
      keyExtractor={(e) => e.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading}>Events today</Text>
          <Text style={styles.date}>{formatToday(data.date)}</Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing matching today</Text>
          <Text style={styles.muted}>
            Try adding more interests in Preferences, or pull down to refresh. You can also browse everything on Sun
            Devil Central.
          </Text>
          <Button title="Open Sun Devil Central" variant="secondary" onPress={() => Linking.openURL(SDC_EVENTS)}
            style={{ marginTop: spacing.md }} />
        </View>
      }
      renderItem={({ item }) => (
        <EventBubble event={item} open={openId === item.id} onPress={() => setOpenId(openId === item.id ? null : item.id)} />
      )}
    />
  );
}

function EventBubble({ event, open, onPress }: { event: CampusEvent; open: boolean; onPress: () => void }) {
  const place = eventPlace(event);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Hides details' : 'Shows details'}
      style={({ pressed }) => [styles.bubble, open && styles.bubbleOpen, pressed && { opacity: 0.85 }]}>
      <View style={styles.row}>
        <Text style={styles.time}>{formatEventTime(event)}</Text>
        {!!place && <Text style={styles.place}>{place}</Text>}
      </View>
      <Text style={styles.title} numberOfLines={open ? undefined : 2}>{event.title}</Text>

      {open && (
        <View style={styles.details}>
          {event.description ? (
            <Text style={styles.description}>{event.description}</Text>
          ) : (
            <Text style={styles.muted}>No description provided.</Text>
          )}

          <Text style={styles.label}>Matched your interests</Text>
          <View style={styles.tags}>
            {event.matched.map((m) => (
              <View key={m} style={styles.tag}>
                <Text style={styles.tagText}>{m}</Text>
              </View>
            ))}
          </View>

          <Button
            title="Check location on Sun Devil Central"
            onPress={() => Linking.openURL(event.event_url || SDC_EVENTS)}
            style={{ marginTop: spacing.md }}
          />
        </View>
      )}

      {!open && event.matched.length > 0 && (
        <Text style={styles.matchedLine} numberOfLines={1}>Matches: {event.matched.join(', ')}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  header: { marginBottom: spacing.xs },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text },
  date: { fontSize: 16, color: colors.muted, marginTop: 2 },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.error, fontSize: 14, marginTop: spacing.sm },
  empty: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.md,
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
  },
  bubbleOpen: { backgroundColor: '#FBF3F5' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  time: { fontSize: 14, fontWeight: '700', color: colors.primary },
  place: { fontSize: 13, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  matchedLine: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  details: { marginTop: spacing.sm },
  description: { fontSize: 15, color: colors.text, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 13, fontWeight: '700', color: colors.text },
});
