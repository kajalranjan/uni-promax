import { File } from 'expo-file-system';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

type PickedFile = { name: string; text: string };

export default function AcademicsOnboarding() {
  const { session, refreshProfile } = useAuth();
  const [canvasUrl, setCanvasUrl] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [learningStyle, setLearningStyle] = useState('');
  const [timeStyle, setTimeStyle] = useState('');
  const [goals, setGoals] = useState('');
  const [errors, setErrors] = useState<{ url?: string; file?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function pickFile() {
    let picked: File;
    try {
      // The file system's own picker grants read access to the file the student chooses.
      const res = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (res.canceled) return;
      picked = res.result;
    } catch (e) {
      setErrors((x) => ({ ...x, file: e instanceof Error ? e.message : "Couldn't open the file picker" }));
      return;
    }
    // Android often reports an internal ID instead of the real file name, so we
    // check the contents (below) rather than the ".ics" ending.
    const name = picked.name?.toLowerCase().endsWith('.ics') ? picked.name : 'Class schedule (.ics)';
    // Read it right away, while we have access, and keep the text for "Build my schedule".
    let text = '';
    try {
      text = await picked.text();
    } catch {
      try {
        text = await (await fetch(picked.uri)).text(); // second way of reading local files
      } catch (e) {
        setErrors((x) => ({ ...x, file: `Couldn't read that file. ${e instanceof Error ? e.message : ''}` }));
        return;
      }
    }
    if (!text.includes('BEGIN:VCALENDAR')) {
      setErrors((x) => ({ ...x, file: "That file isn't a calendar (.ics) file" }));
      return;
    }
    setFile({ name, text });
    setErrors((x) => ({ ...x, file: undefined }));
  }

  async function onSubmit() {
    const found: typeof errors = {};
    if (!/^(https|webcal):\/\/\S+\.ics$/i.test(canvasUrl.trim())) {
      found.url = 'Paste your Canvas Calendar Feed link (it ends in .ics)';
    }
    if (!file) found.file = 'Upload your class schedule .ics file';
    setErrors(found);
    if (Object.keys(found).length || !file || !session) return;

    setLoading(true);
    try {
      await apiPost('/academics/onboarding', {
        canvas_ics_url: canvasUrl.trim(),
        class_schedule_ics: file.text,
        class_schedule_name: file.name,
        learning_style: learningStyle.trim() || null,
        time_management_style: timeStyle.trim() || null,
        semester_goals: goals.trim() || null,
      }, session.access_token);
      await refreshProfile();
      router.replace('/academics');
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : 'Something went wrong, try again' });
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Text style={styles.heading}>Set up Academics</Text>
      <Text style={styles.intro}>
        Connect your Canvas calendar and your class schedule. We'll build a study plan so big
        assignments get done a little at a time, not the night before.
      </Text>

      <Text style={styles.step}>1. Canvas calendar</Text>
      <TextField
        label="Canvas Calendar Feed link"
        value={canvasUrl}
        onChangeText={(t) => {
          setCanvasUrl(t);
          if (errors.url) setErrors((e) => ({ ...e, url: undefined }));
        }}
        error={errors.url}
        placeholder="https://canvas.asu.edu/feeds/calendars/user_….ics"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <HelpLink href="/academics/help-canvas" text="How do I find this link?" />

      <Text style={styles.step}>2. Class schedule</Text>
      <Pressable onPress={pickFile} style={[styles.fileBox, !!errors.file && { borderColor: colors.error }]}
        accessibilityRole="button" accessibilityLabel="Choose class schedule file">
        <Text style={[styles.fileText, file && { color: colors.text, fontWeight: '600' }]}>
          {file ? `📄 ${file.name}` : 'Choose .ics file'}
        </Text>
        <Text style={styles.fileAction}>{file ? 'Change' : 'Browse'}</Text>
      </Pressable>
      {!!errors.file && <Text style={styles.error}>{errors.file}</Text>}
      <HelpLink href="/academics/help-schedule" text="How do I get this file?" />

      <Text style={styles.step}>3. About you <Text style={styles.optional}>(optional)</Text></Text>
      <Text style={styles.hint}>The AI uses this to plan your study sessions and reminders.</Text>
      <TextField label="How do you learn best?" value={learningStyle} onChangeText={setLearningStyle}
        placeholder="e.g. I focus best in short sessions, I like studying in the morning"
        multiline style={styles.multiline} maxLength={2000} />
      <TextField label="How do you manage your time?" value={timeStyle} onChangeText={setTimeStyle}
        placeholder="e.g. I tend to procrastinate, I work 20 hours a week"
        multiline style={styles.multiline} maxLength={2000} />
      <TextField label="Your goals this semester" value={goals} onChangeText={setGoals}
        placeholder="e.g. Get a 3.5 GPA, stop cramming for exams"
        multiline style={styles.multiline} maxLength={2000} />

      {!!errors.form && <Text style={[styles.error, { marginBottom: spacing.sm }]}>{errors.form}</Text>}
      {loading && <Text style={styles.hint}>Importing your calendars and building your plan. This can take up to a minute…</Text>}
      <Button title="Build my schedule" onPress={onSubmit} loading={loading} style={{ marginTop: spacing.sm, marginBottom: spacing.lg }} />
    </FormScreen>
  );
}

function HelpLink({ href, text }: { href: '/academics/help-canvas' | '/academics/help-schedule'; text: string }) {
  return (
    <View style={styles.helpRow}>
      <Link href={href} style={styles.help}>{text}</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: '800', color: colors.text },
  intro: { fontSize: 15, color: colors.muted, lineHeight: 21, marginTop: spacing.sm, marginBottom: spacing.lg },
  step: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  optional: { fontSize: 15, fontWeight: '400', color: colors.muted },
  hint: { fontSize: 14, color: colors.muted, marginBottom: spacing.md },
  helpRow: { marginTop: -spacing.sm, marginBottom: spacing.lg },
  help: { color: colors.primary, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  fileBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  fileText: { fontSize: 16, color: colors.muted, flexShrink: 1 },
  fileAction: { fontSize: 15, fontWeight: '700', color: colors.primary, marginLeft: spacing.sm },
  error: { color: colors.error, fontSize: 13, marginTop: -spacing.sm, marginBottom: spacing.md },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
