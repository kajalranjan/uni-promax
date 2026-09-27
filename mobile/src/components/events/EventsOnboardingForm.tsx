import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/lib/auth';
import {
  CAMPUSES,
  EMPTY_PREFERENCES,
  EVENT_FORMATS,
  loadEventOptions,
  loadMyEventPreferences,
  saveEventPreferences,
  type EventPreferences,
  type Option,
} from '@/lib/events';
import { colors, spacing } from '@/theme';

type Props = {
  /** 'onboarding' = first visit to Social, 'edit' = changing saved preferences later. */
  mode: 'onboarding' | 'edit';
  onSaved: () => void;
};

// Social / Events onboarding:
//   1. Interests (required, pick at least one)
//   2. Preferred ASU campus (optional dropdown)
//   3. Event type: in person / online / both
//   4. Clubs & groups (optional, collapsed by default)
export function EventsOnboardingForm({ mode, onSaved }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [interests, setInterests] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [prefs, setPrefs] = useState<EventPreferences>(EMPTY_PREFERENCES);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  const [showTags, setShowTags] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [interestError, setInterestError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadState('loading');
    Promise.all([loadEventOptions(), loadMyEventPreferences(userId)])
      .then(([options, saved]) => {
        if (cancelled) return;
        setInterests(options.interests);
        setTags(options.tags);
        setPrefs(saved);
        if (saved.tagIds.length > 0) setShowTags(true);
        setLoadState('ready');
      })
      .catch(() => !cancelled && setLoadState('error'));
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const visibleTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  }, [tags, tagSearch]);

  function toggle(key: 'interestIds' | 'tagIds', id: number) {
    setPrefs((p) => {
      const list = p[key];
      return { ...p, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });
    if (key === 'interestIds') setInterestError('');
  }

  async function onSave() {
    setFormError('');
    if (prefs.interestIds.length === 0) {
      setInterestError('Choose at least one interest');
      return;
    }
    setSaving(true);
    try {
      await saveEventPreferences(prefs);
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong, try again');
    } finally {
      setSaving(false);
    }
  }

  if (loadState !== 'ready') {
    return (
      <View style={styles.center}>
        {loadState === 'loading' ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <Text style={styles.muted}>Couldn't load your options.</Text>
            <Button title="Try again" variant="secondary" onPress={() => setReloadKey((k) => k + 1)} style={{ marginTop: spacing.md }} />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {mode === 'onboarding' && (
          <>
            <Text style={styles.heading}>Find your people</Text>
            <Text style={styles.intro}>
              Tell us what you're into and we'll show you campus events happening today that match.
            </Text>
          </>
        )}

        {/* 1. Interests */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>What are you interested in?</Text>
            <Text style={styles.count}>{prefs.interestIds.length} selected</Text>
          </View>
          <Text style={styles.hint}>Pick as many as you like.</Text>
          <View style={styles.chips}>
            {interests.map((i) => (
              <Chip key={i.id} label={i.name} selected={prefs.interestIds.includes(i.id)} onPress={() => toggle('interestIds', i.id)} />
            ))}
          </View>
          {!!interestError && <Text style={styles.error}>{interestError}</Text>}
        </View>

        {/* 2. Preferred campus (optional) */}
        <View style={styles.section}>
          <SelectField
            label="Preferred campus (optional)"
            value={prefs.preferredCampus}
            options={CAMPUSES}
            noneLabel="No preference"
            onChange={(preferredCampus) => setPrefs((p) => ({ ...p, preferredCampus }))}
          />
        </View>

        {/* 3. Event type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferred event type</Text>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {EVENT_FORMATS.map((f) => {
              const selected = prefs.eventFormat === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setPrefs((p) => ({ ...p, eventFormat: f.value }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.segmentItem, selected && styles.segmentSelected]}>
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 4. Clubs & groups (optional) */}
        <View style={styles.section}>
          <Pressable
            onPress={() => setShowTags((s) => !s)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showTags }}
            style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Clubs & groups (optional)</Text>
            <Text style={styles.link}>
              {prefs.tagIds.length > 0 ? `${prefs.tagIds.length} selected ` : ''}
              {showTags ? '▴' : '▾'}
            </Text>
          </Pressable>
          {showTags && (
            <>
              <Text style={styles.hint}>Get events from specific communities, colleges or programs.</Text>
              <TextField
                label="Search"
                value={tagSearch}
                onChangeText={setTagSearch}
                placeholder="e.g. Barrett, Sustainability"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              <View style={styles.chips}>
                {visibleTags.map((t) => (
                  <Chip key={t.id} label={t.name} selected={prefs.tagIds.includes(t.id)} onPress={() => toggle('tagIds', t.id)} />
                ))}
                {visibleTags.length === 0 && <Text style={styles.muted}>No matches</Text>}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {!!formError && <Text style={styles.error}>{formError}</Text>}
        <Button title={mode === 'onboarding' ? 'Show me events' : 'Save'} onPress={onSave} loading={saving} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text },
  intro: { fontSize: 16, color: colors.muted, marginTop: spacing.sm, lineHeight: 22 },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  count: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  hint: { fontSize: 14, color: colors.muted, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.error, fontSize: 14, marginTop: spacing.sm, marginBottom: spacing.xs },
  segment: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  segmentItem: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.background },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  segmentTextSelected: { color: '#fff' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
