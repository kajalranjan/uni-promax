import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDay, formatTime } from '@/lib/dates';
import { colors, spacing } from '@/theme';

type Props = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  mode: 'time' | 'date';
};

/** Tappable field that opens the phone's native date or time picker. */
export function DateTimeField({ label, value, onChange, mode }: Props) {
  const [open, setOpen] = useState(false);
  const text = mode === 'time' ? formatTime(value) : formatDay(value);

  function onPress() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onChange(d);
        },
      });
    } else {
      setOpen((o) => !o);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={styles.field} accessibilityRole="button" accessibilityLabel={`${label}: ${text}`}>
        <Text style={styles.value}>{text}</Text>
      </Pressable>
      {open && Platform.OS === 'ios' && (
        <DateTimePicker
          value={value}
          mode={mode}
          display="spinner"
          minuteInterval={mode === 'time' ? 5 : undefined}
          onChange={(_e, d) => d && onChange(d)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: { fontSize: 16, color: colors.text },
});
