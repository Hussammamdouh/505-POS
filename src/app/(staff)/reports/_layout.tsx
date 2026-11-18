import { Redirect, Slot } from 'expo-router';
import { View } from 'react-native';

import { canManage, useApp } from '@/store/app';
import { REPORT_SECTIONS } from '@/ui/reports/sections';
import { SectionNav, sectionLayoutStyles } from '@/ui/SectionNav';

export default function ReportsLayout() {
  const session = useApp((state) => state.session);
  if (!canManage(session)) {
    return <Redirect href="/register" />;
  }

  return (
    <View style={sectionLayoutStyles.screen}>
      <SectionNav title="Reports" sections={REPORT_SECTIONS} />
      <View style={sectionLayoutStyles.content}>
        <Slot />
      </View>
    </View>
  );
}
