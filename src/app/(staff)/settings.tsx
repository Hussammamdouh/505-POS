import { Redirect } from 'expo-router';

// Device settings now live under Admin.
export default function SettingsScreen() {
  return <Redirect href="/admin/device" />;
}
