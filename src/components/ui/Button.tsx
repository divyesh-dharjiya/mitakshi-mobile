import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from '@/components/icons';
import { F, alpha, makeStyles, useTheme } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  block?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Accessible name and tooltip; required when the label is hidden. */
  label?: string;
  /** Hide the text and show only the icon (compact toolbars). */
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const HEIGHT: Record<Size, number> = { sm: 36, md: 44, lg: 56 };
const FONT: Record<Size, number> = { sm: 13, md: 14.5, lg: 16.5 };

/** Primary actions use the brand gradient and a soft glow; secondary and ghost are for everything else. */
export function Button({ variant = 'secondary', size = 'md', icon: Icon, block, disabled, onPress, label, iconOnly, style, children }: ButtonProps) {
  const C = useTheme();
  const styles = useStyles();
  const color = variant === 'primary' ? C.onAccent : variant === 'ghost' ? C.text2 : variant === 'danger' ? C.danger : C.text;
  const h = HEIGHT[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      // @ts-expect-error `title` is a react-native-web prop (native tooltip)
      title={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        { height: h, borderRadius: size === 'lg' ? h / 2 : 14, paddingHorizontal: iconOnly ? 0 : size === 'lg' ? 26 : size === 'sm' ? 14 : 18, width: iconOnly ? h : undefined },
        variant === 'secondary' && { backgroundColor: hovered ? C.fill3 : C.fill2, borderColor: C.line },
        variant === 'ghost' && { backgroundColor: hovered ? C.fill2 : 'transparent', borderColor: 'transparent' },
        variant === 'danger' && { backgroundColor: alpha(C.danger, hovered ? 0.18 : 0.12), borderColor: alpha(C.danger, 0.3) },
        variant === 'primary' && styles.primary,
        block && styles.block,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {variant === 'primary' && <LinearGradient {...C.grad} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      <View style={styles.content}>
        {Icon && <Icon size={size === 'lg' ? 20 : 17} color={color} strokeWidth={2.2} />}
        {!iconOnly && children != null && (
          <Text numberOfLines={1} style={[styles.text, { color, fontSize: FONT[size] }, variant === 'primary' && { fontFamily: F.uiBold }]}>
            {children}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  disabled?: boolean;
  onPress?: () => void;
}

/** Round icon-only button. `label` becomes the accessible name and the tooltip. */
export function IconButton({ icon: Icon, label, active, size = 'md', disabled, onPress }: IconButtonProps) {
  const C = useTheme();
  const styles = useStyles();
  const s = size === 'sm' ? 34 : 42;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      // @ts-expect-error react-native-web tooltip
      title={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.icon,
        { width: s, height: s, borderRadius: s / 2 },
        (hovered || pressed) && !disabled && { backgroundColor: C.fill3 },
        active && { backgroundColor: C.accentSoft },
        disabled && styles.disabled,
      ]}
    >
      <Icon size={size === 'sm' ? 16 : 19} color={active ? C.accent : C.text} strokeWidth={2} />
    </Pressable>
  );
}

const useStyles = makeStyles((C) => ({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: {
    borderColor: 'transparent',
    shadowColor: C.accent,
    shadowOpacity: C.mode === 'dark' ? 0.4 : 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  text: { fontFamily: F.uiSemi },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.975 }] },
  icon: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2 },
}));
