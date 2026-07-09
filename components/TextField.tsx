import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, type as typeScale, useTheme } from '../lib/theme';

type Props = TextInputProps & {
  label: string;
};

export function TextField({ label, style, ...inputProps }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[typeScale.secondary, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface2,
            borderColor: theme.borderStrong,
            color: theme.textPrimary,
          },
          style,
        ]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});
