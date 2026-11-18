// Months as "2026-10" strings, for screens settled month by month with salaries (Penalties, Reports → Staff).

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** First and last business date of a month ("2026-10"), plus its name. */
export function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}`, label: `${MONTH_NAMES[monthNumber - 1]} ${year}` };
}

export function shiftMonth(month: string, by: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}
