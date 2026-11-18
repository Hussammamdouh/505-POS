import { Image, type ImageStyle, type StyleProp } from 'react-native';

// Both logo files are white artwork on transparency: show the wordmark on olive or burgundy,
// and tint the character mark when it sits on a light surface. The files are small, so keep
// them near their natural size (170x113 and 210x263 px) to stay sharp.
const WORDMARK = require('../../assets/logo primary.png');
const CHARACTER = require('../../assets/Logo secondary.png');
const WORDMARK_RATIO = 170 / 113;
const CHARACTER_RATIO = 210 / 263;

export function BrandWordmark({ height, style }: { height: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={WORDMARK}
      accessibilityRole="image"
      accessibilityLabel="505 Coffee & Love"
      resizeMode="contain"
      style={[{ height, width: height * WORDMARK_RATIO }, style]}
    />
  );
}

export function BrandCharacter({ height, tint, style }: { height: number; tint?: string; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={CHARACTER}
      accessibilityElementsHidden
      importantForAccessibility="no"
      resizeMode="contain"
      style={[{ height, width: height * CHARACTER_RATIO }, tint ? { tintColor: tint } : null, style]}
    />
  );
}
