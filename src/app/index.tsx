import { Redirect } from 'expo-router';

import { homeFor, useApp } from '@/store/app';

export default function Index() {
  const settings = useApp((state) => state.settings);
  const session = useApp((state) => state.session);
  const workspace = useApp((state) => state.workspace);

  if (!settings) {
    return <Redirect href="/setup" />;
  }

  return <Redirect href={session ? homeFor(workspace) : '/login'} />;
}
