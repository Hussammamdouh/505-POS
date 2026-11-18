import { useWindowDimensions } from 'react-native';

// Screens narrower than this get the tighter layouts. The register's iPad (9th gen, 10.2") is 1080 pt wide
// in landscape; the full layouts were sized on a wider tablet and need ~1200 pt.
export const COMPACT_BELOW = 1240;

export const useCompact = () => useWindowDimensions().width < COMPACT_BELOW;
