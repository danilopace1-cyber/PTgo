import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { radius, useTheme } from '../lib/theme';

type Variant = 'primary' | 'outline' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  style?: ViewStyle;
};

// One primary action per screen: exactly one Button on screen may use the
// default "primary" variant; everything else is outline or ghost.
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  danger = false,
  style,
}: Props) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const backgroundColor =
    variant === 'primary' ? theme.fillPrimary : variant === 'outline' ? theme.surface2 : 'transparent';
  const textColor =
    variant === 'primary'
      ? theme.onFillPrimary
      : danger
        ? theme.danger.text
        : theme.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: theme.borderStrong,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
