import { useEffect, useState } from 'react';

import { describeError, NetworkError } from '@/lib/api';
import type { DateRange } from '@/lib/reports';

interface ReportState<T> {
  key: string;
  data?: T;
  error?: string;
}

/** Loads a report for a range; keeps the previous result on screen while the next one loads. */
export function useReport<T>(load: (range: DateRange) => Promise<T>, range: DateRange) {
  const key = `${range.from}|${range.to}`;
  const [state, setState] = useState<ReportState<T>>({ key: '' });

  useEffect(() => {
    let active = true;
    const [from, to] = key.split('|');
    load({ from, to })
      .then((data) => active && setState({ key, data }))
      .catch(
        (error) =>
          active && setState({ key, error: error instanceof NetworkError ? 'Reports need the internet.' : describeError(error) }),
      );
    return () => {
      active = false;
    };
  }, [key, load]);

  return { data: state.data, error: state.key === key ? state.error : undefined, loading: state.key !== key };
}
