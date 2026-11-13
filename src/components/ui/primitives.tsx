import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { isHovered, makeStyles, useTheme } from '@/theme';
import { F, R } from '@/theme';

/* Small shared building blocks: Segmented and Switch. */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive, disabled && { opacity: 0.4 }]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, active && styles.segmentTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** On/off option shown as a labelled card. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const C = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={(st) => [styles.switchRow, isHovered(st) && { backgroundColor: C.fill2 }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.switchText}>
        <Text style={styles.switchLabel}>{label}</Text>
        {description && <Text style={styles.switchDesc}>{description}</Text>}
      </View>
      <View style={[styles.track, checked && { backgroundColor: 'transparent' }]}>
        {checked && <LinearGradient {...C.grad} style={StyleSheet.absoluteFill} />}
        <View style={[styles.thumb, checked && { left: 19 }]} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((C) => ({
  segmented: { flexDirection: 'row', gap: 2, padding: 4, borderRadius: 16, backgroundColor: C.fill1, borderWidth: 1, borderColor: C.line },
  segment: { flex: 1, minWidth: 0, height: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderRadius: 12 },
  segmentActive: { backgroundColor: C.raised, shadowColor: '#000', shadowOpacity: C.mode === 'dark' ? 0.35 : 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  segmentText: { color: C.text3, fontSize: 13.5, fontFamily: F.uiSemi },
  segmentTextOn: { color: C.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingLeft: 16, paddingRight: 14, borderRadius: R.md, backgroundColor: C.fill1 },
  switchText: { flex: 1, minWidth: 0 },
  switchLabel: { color: C.text, fontSize: 13.5, fontFamily: F.uiSemi },
  switchDesc: { color: C.text3, fontSize: 12, lineHeight: 17, marginTop: 1, fontFamily: F.ui },
  track: { width: 42, height: 26, borderRadius: R.pill, backgroundColor: C.fill3, overflow: 'hidden' },
  thumb: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
}));
