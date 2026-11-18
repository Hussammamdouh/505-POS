import { useApp } from '@/store/app';

import { apiRequest } from './api';
import { kvGet, kvSet } from './db';
import { toPiastres, type Piastres } from './money';
import { lineTotal, toLineRequest, unitPrice, type CartLine } from './pricing';

// An order's discounts, as on the server (DiscountRules): the stamp card's free drink first, then
// the best of the automatic offer and a promo code (they don't stack). Online the server works them
// out; offline the iPad applies the offers it saved (the card and promo codes need the internet).

export interface LoyaltyCard {
  phone: string;
  customerName: string | null;
  stamps: number;
  ordersForReward: number;
  rewardDueNow: boolean;
  isActive: boolean;
}

/** Amounts in piastres. */
export interface DiscountQuote {
  subtotal: Piastres;
  freeDrinkDiscount: Piastres;
  freeLineIndex: number | null;
  offerId: string | null;
  offerName: string | null;
  offerDiscount: Piastres;
  promoCode: string | null;
  promoDiscount: Piastres;
  promoMessage: string | null;
  totalDiscount: Piastres;
  netAmount: Piastres;
  card: LoyaltyCard | null;
  /** Worked out on this iPad from saved offers, because the server couldn't be reached. */
  local: boolean;
}

export interface Offer {
  id: string;
  name: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  appliesToWholeOrder: boolean;
  categoryIds: string[];
  menuItemIds: string[];
  startsAt: string;
  endsAt: string;
  dailyStart: string | null;
  dailyEnd: string | null;
  validOnPos: boolean;
  validOnWeb: boolean;
  isActive: boolean;
}

interface ServerQuote {
  subtotal: number;
  freeDrinkDiscount: number;
  freeLineIndex: number | null;
  offerId: string | null;
  offerName: string | null;
  offerDiscount: number;
  promoCode: string | null;
  promoDiscount: number;
  promoMessage: string | null;
  totalDiscount: number;
  netAmount: number;
  card: LoyaltyCard | null;
}

const OFFERS_KEY = 'pos-offers';

export const lookupCard = (phone: string) => apiRequest<LoyaltyCard>('GET', `/api/v1/loyalty/card?phone=${encodeURIComponent(phone)}`);

/** Saves the offers running now or this week, so they still apply when the internet is down. */
export async function refreshOffers() {
  await kvSet(OFFERS_KEY, await apiRequest<Offer[]>('GET', '/api/v1/offers/upcoming'));
}

export async function quoteOnline(lines: CartLine[], phone: string, promoCode: string): Promise<DiscountQuote> {
  const quote = await apiRequest<ServerQuote>('POST', '/api/v1/orders/pos/quote', {
    body: { items: lines.map(toLineRequest), customerPhone: phone.trim() || null, promoCode: promoCode.trim() || null },
  });
  return {
    ...quote,
    subtotal: toPiastres(quote.subtotal),
    freeDrinkDiscount: toPiastres(quote.freeDrinkDiscount),
    offerDiscount: toPiastres(quote.offerDiscount),
    promoDiscount: toPiastres(quote.promoDiscount),
    totalDiscount: toPiastres(quote.totalDiscount),
    netAmount: toPiastres(quote.netAmount),
    local: false,
  };
}

/** The best saved offer running now, worked out on the iPad. */
export async function quoteOffline(lines: CartLine[]): Promise<DiscountQuote> {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const offers = (await kvGet<Offer[]>(OFFERS_KEY)) ?? [];
  const categoryOf = new Map(useApp.getState().catalog.flatMap((category) => category.items.map((item) => [item.id, category.id] as const)));
  const now = new Date();

  let best: { offer: Offer; discount: Piastres } | null = null;
  for (const offer of offers) {
    if (!offer.isActive || !offer.validOnPos || new Date(offer.startsAt) > now || new Date(offer.endsAt) <= now || !inDailyWindow(offer, now)) {
      continue;
    }

    const eligible = lines
      .filter((line) => offer.appliesToWholeOrder || offer.menuItemIds.includes(line.menuItemId) || offer.categoryIds.includes(categoryOf.get(line.menuItemId) ?? ''))
      .reduce((sum, line) => sum + lineTotal(line), 0);
    const discount = Math.min(
      eligible,
      offer.discountType === 'PERCENTAGE' ? Math.round((eligible * offer.discountValue) / 100) : toPiastres(offer.discountValue),
    );
    if (discount > 0 && (!best || discount > best.discount)) {
      best = { offer, discount };
    }
  }

  const discount = best?.discount ?? 0;
  return {
    subtotal,
    freeDrinkDiscount: 0,
    freeLineIndex: null,
    offerId: best?.offer.id ?? null,
    offerName: best?.offer.name ?? null,
    offerDiscount: discount,
    promoCode: null,
    promoDiscount: 0,
    promoMessage: null,
    totalDiscount: discount,
    netAmount: subtotal - discount,
    card: null,
    local: true,
  };
}

const CAIRO_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false });

/** Whether an offer's daily hours include now (Cairo time); hours may run past midnight. */
function inDailyWindow(offer: Offer, now: Date): boolean {
  if (!offer.dailyStart || !offer.dailyEnd) {
    return true;
  }

  const time = CAIRO_TIME.format(now).replace(/^24/, '00');
  return offer.dailyStart <= offer.dailyEnd ? time >= offer.dailyStart && time < offer.dailyEnd : time >= offer.dailyStart || time < offer.dailyEnd;
}

/** One line for the receipt and order list, e.g. "Halloween + free drink". */
export function discountLabel(quote: DiscountQuote): string | null {
  const parts = [quote.offerName, quote.promoCode, quote.freeDrinkDiscount > 0 ? 'Free drink' : null].filter((part) => part);
  return parts.length > 0 ? parts.join(' + ') : null;
}

/** The free drink's unit price is what the stamp card covers (shown in the cart). */
export const freeDrinkLine = (lines: CartLine[], quote: DiscountQuote | null) =>
  quote?.freeLineIndex != null ? { line: lines[quote.freeLineIndex], amount: Math.min(unitPrice(lines[quote.freeLineIndex]), quote.freeDrinkDiscount) } : null;
