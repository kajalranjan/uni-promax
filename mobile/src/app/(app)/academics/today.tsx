import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { TodoRow } from '@/components/TodoRow';
import {
  addCommitment, addTodo, deleteBlock, getEntries, getTodos, replan, setTodoDone,
  type CalendarEntry, type Todo,
} from '@/lib/academics';
import { useAuth } from '@/lib/auth';
import { addDays, formatRange, formatTime, startOfDay } from '@/lib/dates';
import { colors, kindColors, spacing } from '@/theme';

type Tab = 'schedule' | 'todo';

export default function TodayScreen() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('schedule');
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async () => {
    const start = startOfDay(new Date());
    const [e, t] = await Promise.all([getEntries(start, addDays(start, 1)), getTodos()]);
    setEntries(e);
    setTodos(t);
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  /** Ask the backend to rebuild study sessions, then refresh the screen. */
  async function rebuildPlan() {
    if (!session) return;
    setPlanning(true);
    try {
      await replan(session.access_token);
    } catch (e) {
      Alert.alert("Couldn't update your plan", e instanceof Error ? e.message : '');
    }
    await load().catch(() => {});
    setPlanning(false);
  }

  async function toggle(t: Todo) {
    setTodos((all) => all.map((x) => (x.id === t.id ? { ...x, isDone: !x.isDone } : x)));
    try {
      await setTodoDone(t.id, !t.isDone);
      rebuildPlan(); // finished work no longer needs study time
    } catch {
      load();
    }
  }

  function onPressEntry(e: CalendarEntry) {
    const info = [kindColors[e.kind].label, formatRange(e.start, e.end), e.location ?? ''].filter(Boolean).join('\n');
    if (e.kind === 'commitment') {
      Alert.alert(e.title, info, [
        { text: 'Close', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await deleteBlock(e.id); rebuildPlan(); } },
      ]);
    } else {
      Alert.alert(e.title, info);
    }
  }

  const schedule = entries.filter((e) => !e.allDay || e.kind === 'assignment');

  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          headerRight: () =>
            tab === 'schedule' ? (
              <Pressable onPress={() => setShowAdd(true)} hitSlop={10} accessibilityRole="button"
                accessibilityLabel="Add a time commitment">
                <Text style={styles.headerBtn}>+ Commitment</Text>
              </Pressable>
            ) : null,
        }}
      />
      <View style={styles.tabs}>
        <Segmented<Tab>
          options={[{ value: 'schedule', label: 'Schedule' }, { value: 'todo', label: 'To-do' }]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {planning && <Text style={styles.planning}>Updating your plan…</Text>}

      {tab === 'schedule' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {schedule.length === 0 && (
            <Text style={styles.empty}>Nothing scheduled today. Tap "+ Commitment" to add something you have to do.</Text>
          )}
          {schedule.map((e) => {
            const c = kindColors[e.kind];
            return (
              <Pressable key={e.id} onPress={() => onPressEntry(e)} style={styles.item} accessibilityRole="button">
                <Text style={styles.itemTime}>{formatTime(e.start)}</Text>
                <View style={[styles.itemCard, { backgroundColor: c.fill, borderLeftColor: c.edge }]}>
                  <Text style={[styles.itemTitle, { color: c.text }]}>{e.title}</Text>
                  <Text style={[styles.itemMeta, { color: c.text }]}>
                    {c.label}{e.end ? ` · until ${formatTime(e.end)}` : ''}{e.location ? ` · ${e.location}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <TodoList todos={todos} onToggle={toggle} onAdded={async (hasDue) => { await load(); if (hasDue) rebuildPlan(); }} />
      )}

      <AddCommitment
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); rebuildPlan(); }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function TodoList({ todos, onToggle, onAdded }:
  { todos: Todo[]; onToggle: (t: Todo) => void; onAdded: (hasDue: boolean) => void }) {
  const [title, setTitle] = useState('');
  const [withDue, setWithDue] = useState(false);
  const [due, setDue] = useState(() => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; });
  const [showDone, setShowDone] = useState(false);

  async function add() {
    if (!title.trim()) return;
    try {
      await addTodo(title.trim(), withDue ? due : null);
      setTitle('');
      onAdded(withDue);
    } catch (e) {
      Alert.alert("Couldn't add that", e instanceof Error ? e.message : '');
    }
  }

  const open = todos.filter((t) => !t.isDone);
  const done = todos.filter((t) => t.isDone);

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <View style={styles.addBox}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Add a to-do…"
          placeholderTextColor={colors.muted}
          style={styles.addInput}
          returnKeyType="done"
          onSubmitEditing={add}
          accessibilityLabel="New to-do"
        />
        <View style={styles.dueRow}>
          <Text style={styles.dueLabel}>Due date</Text>
          <Switch value={withDue} onValueChange={setWithDue} trackColor={{ true: colors.primary }} />
        </View>
        {withDue && <DateTimeField label="Due" mode="date" value={due} onChange={(d) => { d.setHours(23, 59, 0, 0); setDue(new Date(d)); }} />}
        <Button title="Add" onPress={add} disabled={!title.trim()} />
      </View>

      {open.length === 0 && <Text style={styles.empty}>All caught up!</Text>}
      {open.map((t) => <TodoRow key={t.id} todo={t} onToggle={() => onToggle(t)} />)}

      {done.length > 0 && (
        <Pressable onPress={() => setShowDone((s) => !s)} style={{ paddingVertical: spacing.sm }}>
          <Text style={styles.doneToggle}>{showDone ? 'Hide' : 'Show'} completed ({done.length})</Text>
        </Pressable>
      )}
      {showDone && done.map((t) => <TodoRow key={t.id} todo={t} onToggle={() => onToggle(t)} />)}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

function AddCommitment({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(at(new Date().getHours() + 1));
  const [end, setEnd] = useState(at(new Date().getHours() + 2));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return setError('Give it a name, like "Work shift" or "Gym"');
    if (end <= start) return setError('The end time must be after the start time');
    setSaving(true);
    try {
      await addCommitment(title.trim(), start, end);
      setTitle('');
      setError('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setSaving(false);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.headerBtn}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>New commitment</Text>
          <View style={{ width: 56 }} />
        </View>
        <Text style={styles.modalIntro}>
          Add anything else you have today (work, practice, appointments). Your AI study plan will move around it.
        </Text>
        <TextField label="What is it?" value={title} onChangeText={setTitle} placeholder="Work shift" />
        <DateTimeField label="Starts" mode="time" value={start} onChange={setStart} />
        <DateTimeField label="Ends" mode="time" value={end} onChange={setEnd} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title="Save" onPress={save} loading={saving} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  tabs: { padding: spacing.md, paddingBottom: spacing.sm },
  planning: { textAlign: 'center', color: colors.muted, fontSize: 13 },
  headerBtn: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  list: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  empty: { color: colors.muted, fontSize: 15, textAlign: 'center', marginVertical: spacing.lg, lineHeight: 21 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemTime: { width: 64, fontSize: 13, color: colors.muted, fontWeight: '600', paddingTop: 10, textAlign: 'right' },
  itemCard: { flex: 1, borderLeftWidth: 4, borderRadius: 10, padding: spacing.sm + 2 },
  itemTitle: { fontSize: 16, fontWeight: '700' },
  itemMeta: { fontSize: 13, marginTop: 2, opacity: 0.85 },
  addBox: { backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, marginBottom: spacing.sm },
  addInput: {
    fontSize: 16, color: colors.text, backgroundColor: colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10,
  },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.sm },
  dueLabel: { fontSize: 15, color: colors.text },
  doneToggle: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  modal: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalIntro: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: spacing.lg },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
});
