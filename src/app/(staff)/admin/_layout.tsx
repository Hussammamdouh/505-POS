import { Redirect, Slot } from 'expo-router';
import { View } from 'react-native';

import { canManage, useApp } from '@/store/app';
import { ADMIN_SECTIONS } from '@/ui/admin/sections';
import { SectionNav, sectionLayoutStyles } from '@/ui/SectionNav';

export default function AdminLayout() {
  const session = useApp((state) => state.session);
  if (!canManage(session)) {
    return <Redirect href="/register" />;
  }

  return (
    <View style={sectionLayoutStyles.screen}>
      <SectionNav title="Admin" sections={ADMIN_SECTIONS} />
      <View style={sectionLayoutStyles.content}>
        <Slot />
      </View>
    </View>
  );
}
