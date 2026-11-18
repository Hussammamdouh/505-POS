import { useEffect, useState } from 'react';

import { cachedStaffTiles, fetchStaffTiles } from '@/lib/auth';
import type { StaffLoginTile } from '@/lib/types';
import { ClockPanel } from '@/ui/ClockPanel';

// The same clock-in / out panel as on the sign-in screen, so people can clock out (or a colleague
// can clock in) without signing the register out.
export default function ClockScreen() {
  const [tiles, setTiles] = useState<StaffLoginTile[]>([]);

  useEffect(() => {
    void cachedStaffTiles().then(setTiles);
    void fetchStaffTiles().then(setTiles).catch(() => undefined);
  }, []);

  return <ClockPanel tiles={tiles} />;
}
