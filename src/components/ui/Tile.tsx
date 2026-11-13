import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from '@/components/icons';
import { F, alpha, makeStyles, useTheme } from '@/theme';

/**
 * A square-ish choice: icon, label and an optional status line. Used for one-of-many modes inside the
 * tool panels (for example the background modes).
 */
export function Tile({
  icon: Icon,
  label,
  sub,
  active,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const C = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, active && styles.tileOn, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <View style={[styles.tileIcon, active && { backgroundColor: alpha(C.accent, 0.2) }]}>
        <Icon size={20} color={active ? C.accent : C.text2} strokeWidth={2.1} />
      </View>
      <Text numberOfLines={1} style={[styles.label, active && { color: C.text }]}>
        {label}
      </Text>
      {sub ? (
        <Text numberOfLines={1} style={[styles.sub, active && { color: C.accent }]}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A compact on/off option: icon, name and its current value (Enhance's Faces, Colorize and Size). */
export function OptionPill({
  icon: Icon,
  label,
  value,
  active,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const C = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, active && styles.pillOn, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <View style={[styles.pillIcon, active && { backgroundColor: alpha(C.accent, 0.2) }]}>
        <Icon size={18} color={active ? C.accent : C.text3} strokeWidth={2.1} />
      </View>
      <View style={{ minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.pillLabel, active && { color: C.text }]}>
          {label}
        </Text>
        <Text numberOfLines={1} style={[styles.pillValue, active && { color: C.accent }]}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

/** A small selectable label (the parameters in Edit). */
export function Chip({ label, active, dot, onPress }: { label: string; active: boolean; dot?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipOn]} hitSlop={4}>
      {dot && <View style={styles.dot} />}
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((C) => ({
  tile: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7, paddingVertical: 14, paddingHorizontal: 4, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.fill1 },
  tileOn: { borderColor: C.accentLine, backgroundColor: C.accentSoft },
  tileIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2 },
  label: { color: C.text2, fontSize: 12.5, fontFamily: F.uiSemi },
  sub: { color: C.text3, fontSize: 11, fontFamily: F.uiMedium, marginTop: -3 },
  pill: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 9, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.fill1 },
  pillOn: { borderColor: C.accentLine, backgroundColor: C.accentSoft },
  pillIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2 },
  pillLabel: { color: C.text2, fontSize: 13, fontFamily: F.uiSemi },
  pillValue: { color: C.text3, fontSize: 11.5, fontFamily: F.uiMedium, marginTop: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: C.fill2, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text2, fontSize: 13.5, fontFamily: F.uiSemi },
  chipTextOn: { color: C.onAccent },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
}));
