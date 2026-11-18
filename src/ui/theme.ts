// 505 Coffee & Love brand: olive #363900, burgundy #6D2435, deep burgundy #39131C, white and black.
export const brand = {
  olive: '#363900',
  burgundy: '#6D2435',
  burgundyDeep: '#39131C',
  white: '#FFFFFF',
  black: '#111111',
};

export const colors = {
  background: '#F6F6F0',
  surface: brand.white,
  surfaceMuted: '#ECEDE2',
  border: '#DCDDCB',
  text: brand.black,
  textMuted: '#5C5D52',
  primary: brand.olive,
  primaryPressed: '#262800',
  onPrimary: brand.white,
  accent: brand.burgundy,
  accentDeep: brand.burgundyDeep,
  onAccent: brand.white,
  // Status colours stay distinct from the brand so warnings are never mistaken for decoration.
  danger: '#B3261E',
  dangerSoft: '#FCEBEA',
  warning: '#8A5300',
  warningSoft: '#FFF2DC',
  success: '#1E6E3A',
  successSoft: '#E5F4EA',
  selected: '#E7E8D2',
  backdrop: 'rgba(57, 19, 28, 0.55)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16 };

export const font = {
  small: 14,
  body: 16,
  large: 18,
  title: 22,
  hero: 32,
};

export const TOUCH_TARGET = 52;
