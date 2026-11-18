import { useEffect, useState } from 'react';

import { ApiError, describeError, NetworkError } from '@/lib/api';
import { quoteOffline, quoteOnline, type DiscountQuote } from '@/lib/discounts';
import { useApp } from '@/store/app';

export interface Discounts {
  quote: DiscountQuote | null;
  loading: boolean;
  /** Why the server refused the quote, e.g. a phone number that isn't valid. */
  error: string | null;
}

// Waits for typing to pause before asking the server again.
const QUOTE_DELAY_MS = 400;

/**
 * The current cart's discounts: from the server when online (offer, the phone's stamp card, the promo
 * code), otherwise the offers saved on this iPad. Recalculated whenever the cart, phone or code changes.
 */
export function useDiscounts(): Discounts {
  const cart = useApp((state) => state.cart);
  const phone = useApp((state) => state.customerPhone);
  const promoCode = useApp((state) => state.promoCode);
  const online = useApp((state) => state.connectivity !== 'offline' && Boolean(state.session?.token));
  const [state, setState] = useState<Discounts & { key: string }>({ key: '', quote: null, loading: false, error: null });

  const key = JSON.stringify([cart.map((line) => [line.menuItemId, line.quantity, line.modifiers.map((modifier) => modifier.id)]), phone.trim(), promoCode.trim(), online]);

  useEffect(() => {
    if (cart.length === 0) {
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      const ask = online ? quoteOnline(cart, phone, promoCode) : quoteOffline(cart);
      ask
        .catch((error) => {
          // No server: fall back to the saved offers; a refusal (bad phone or code) is shown to the cashier.
          if (error instanceof NetworkError || (error instanceof ApiError && error.status >= 500)) {
            return quoteOffline(cart);
          }

          throw error;
        })
        .then((quote) => active && setState({ key, quote, loading: false, error: null }))
        .catch((error) => active && setState({ key, quote: null, loading: false, error: describeError(error) }));
    }, QUOTE_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // The key captures everything the quote depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (cart.length === 0) {
    return { quote: null, loading: false, error: null };
  }

  // Until the quote for exactly this cart arrives, the total isn't final, so charging waits.
  return state.key === key ? { quote: state.quote, loading: state.loading, error: state.error } : { quote: null, loading: true, error: null };
}
