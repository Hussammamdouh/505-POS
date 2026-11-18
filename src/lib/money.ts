export type Piastres = number;

export const toPiastres = (egp: number): Piastres => Math.round(egp * 100);

export const toEgp = (piastres: Piastres): number => piastres / 100;

export const formatMoney = (piastres: Piastres): string => (piastres / 100).toFixed(2);

export const formatEgp = (piastres: Piastres): string => `${formatMoney(piastres)} EGP`;

export function parseMoneyInput(text: string): Piastres | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  return toPiastres(Number(normalized));
}
