import { useColorScheme } from 'react-native';

// Design tokens from ptgo-spec.md. Colour encodes meaning only; hierarchy
// comes from surface tone steps and hairline borders, never shadows.

export type SemanticPair = { bg: string; text: string };

export type Theme = {
  surface0: string;
  surface1: string;
  surface2: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  fillPrimary: string;
  onFillPrimary: string;
  success: SemanticPair;
  warning: SemanticPair;
  danger: SemanticPair;
  accent: SemanticPair;
  purple: SemanticPair;
};

export const lightTheme: Theme = {
  surface0: '#F6F6F4',
  surface1: '#ECECEA',
  surface2: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#565656',
  textMuted: '#8A8A8A',
  border: '#E2E2E0',
  borderStrong: '#C8C8C6',
  fillPrimary: '#171717',
  onFillPrimary: '#FFFFFF',
  success: { bg: '#E4F3E8', text: '#1D6B34' },
  warning: { bg: '#FBF0DC', text: '#8A5A00' },
  danger: { bg: '#FBE4E4', text: '#A32020' },
  accent: { bg: '#E3EEFB', text: '#1D5FA8' },
  purple: { bg: '#EEE7F9', text: '#6B3FA8' },
};

export const darkTheme: Theme = {
  surface0: '#111111',
  surface1: '#1C1C1C',
  surface2: '#202022',
  textPrimary: '#F2F2F2',
  textSecondary: '#B5B5B5',
  textMuted: '#7C7C7C',
  border: '#2A2A2A',
  borderStrong: '#3D3D3D',
  fillPrimary: '#F2F2F2',
  onFillPrimary: '#111111',
  success: { bg: '#12301C', text: '#7CCB93' },
  warning: { bg: '#33260C', text: '#E0B45C' },
  danger: { bg: '#391717', text: '#E58A8A' },
  accent: { bg: '#14273D', text: '#7FB3E8' },
  purple: { bg: '#251A38', text: '#B79AE8' },
};

// Weights 400/500 only; sizes per the spec's type scale.
export const type = {
  screenTitle: { fontSize: 20, fontWeight: '500' as const },
  cardTitle: { fontSize: 16, fontWeight: '500' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  secondary: { fontSize: 13, fontWeight: '400' as const },
  metadata: { fontSize: 11, fontWeight: '400' as const },
};

export const radius = { control: 8, card: 12, pill: 999 };

export const space = {
  gutter: 20,
  cardPadding: 16,
  gap: 12,
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
