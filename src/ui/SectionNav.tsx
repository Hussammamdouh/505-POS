import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StaffSession } from '@/lib/auth';
import { useApp } from '@/store/app';

import { colors, font, radius, space } from './theme';

export interface Section {
  label: string;
  href: Href;
  allowed: (session: StaffSession | null) => boolean;
}

/** Left-hand navigation for a multi-page area (Admin, Reports), filtered by role. */
export function SectionNav({ title, sections }: { title: string; sections: Section[] }) {
  const session = useApp((state) => state.session);
  const connectivity = useApp((state) => state.connectivity);
  const pathname = usePathname();

  return (
    <View style={styles.nav}>
      <Text style={styles.navTitle}>{title}</Text>
      {sections
        .filter((section) => section.allowed(session))
        .map((section) => {
          const active = pathname === section.href;
          return (
            <Pressable
              key={section.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(section.href)}
              style={[styles.navItem, active && styles.navItemActive]}>
              <Text style={[styles.navText, active && styles.navTextActive]}>{section.label}</Text>
            </Pressable>
          );
        })}
      {connectivity === 'offline' ? <Text style={styles.offline}>{title} needs the internet.</Text> : null}
    </View>
  );
}

export const sectionLayoutStyles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, padding: space.lg },
});

const styles = StyleSheet.create({
  nav: { width: 200, padding: space.md, gap: space.xs, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  navTitle: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', padding: space.sm },
  navItem: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.sm },
  navItemActive: { backgroundColor: colors.primary },
  navText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  navTextActive: { color: colors.onPrimary },
  offline: { fontSize: font.small, color: colors.warning, padding: space.sm },
});
