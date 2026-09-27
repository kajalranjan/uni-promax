import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askAssistant, getMessages, type ChatMessage } from '@/lib/academics';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

const SUGGESTIONS = [
  "What's on my schedule today?",
  'I have work tomorrow from 2 to 6',
  'What should I focus on this week?',
  'Lighten my study plan for Friday',
];

type Message = ChatMessage & { note?: string };

export default function AssistantScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    getMessages().then(setMessages).catch(() => {});
  }, []);

  async function send(message: string) {
    const m = message.trim();
    if (!m || !session || sending) return;
    setText('');
    setSending(true);
    setMessages((all) => [...all, { id: `local-${Date.now()}`, role: 'user', content: m }]);
    try {
      const res = await askAssistant(session.access_token, m);
      const note = res.schedule_changed
        ? res.added_commitments
          ? `✓ Added ${res.added_commitments} commitment${res.added_commitments > 1 ? 's' : ''} and updated your study plan`
          : '✓ Updated your study plan'
        : undefined;
      setMessages((all) => [...all, { id: `reply-${Date.now()}`, role: 'assistant', content: res.reply, note }]);
    } catch (e) {
      setMessages((all) => [...all, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: e instanceof Error ? e.message : 'Something went wrong. Try again.',
      }]);
    }
    setSending(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Hi! I'm your study assistant ✦</Text>
            <Text style={styles.introText}>
              Ask me about your schedule, or tell me about plans and conflicts. I'll move your study
              sessions around them.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={styles.suggestion} accessibilityRole="button">
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.mine : styles.theirs]}>
            <Text style={[styles.text, item.role === 'user' && { color: '#fff' }]}>{item.content}</Text>
            {!!item.note && <Text style={styles.note}>{item.note}</Text>}
          </View>
        )}
        ListFooterComponent={sending ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} /> : null}
      />
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message your assistant…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
          maxLength={2000}
          accessibilityLabel="Message"
        />
        <Pressable
          onPress={() => send(text)}
          disabled={!text.trim() || sending}
          style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Send">
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  intro: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  introTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  introText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21, marginTop: spacing.sm },
  suggestions: { marginTop: spacing.lg, gap: spacing.sm },
  suggestion: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: spacing.md },
  suggestionText: { fontSize: 15, color: colors.text },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  text: { fontSize: 16, color: colors.text, lineHeight: 22 },
  note: { fontSize: 13, color: colors.success, fontWeight: '600', marginTop: 6 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background,
  },
  input: {
    flex: 1, maxHeight: 120, fontSize: 16, color: colors.text, backgroundColor: colors.surface,
    borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
  },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
