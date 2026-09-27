import { Image, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { colors, spacing } from '@/theme';

export type HelpStep = {
  text: string;
  /** Add a screenshot: image: require('@/../assets/tutorials/canvas-1.png') */
  image?: ImageSourcePropType;
};

/** Numbered tutorial page used by the "How do I…?" links. */
export function HelpSteps({ intro, steps, footer }: { intro: string; steps: HelpStep[]; footer?: string }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>{intro}</Text>
      {steps.map((s, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.row}>
            <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
            <Text style={styles.text}>{s.text}</Text>
          </View>
          {s.image && <Image source={s.image} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />}
        </View>
      ))}
      {!!footer && <Text style={styles.footer}>{footer}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  intro: { fontSize: 16, color: colors.muted, lineHeight: 22, marginBottom: spacing.lg },
  step: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  num: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, marginTop: 1,
  },
  numText: { color: '#fff', fontWeight: '800' },
  text: { flex: 1, fontSize: 16, color: colors.text, lineHeight: 23 },
  image: { width: '100%', height: 220, marginTop: spacing.md, borderRadius: 12, backgroundColor: colors.surface },
  footer: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: spacing.sm },
});
