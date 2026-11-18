import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatClock } from '@/lib/businessDay';
import { discardHeldOrder, holdCurrentOrder, resumeHeldOrder, type HeldOrder } from '@/lib/heldOrders';
import { formatEgp, formatMoney } from '@/lib/money';
import { cartSubtotal, lineTotal, type CartLine } from '@/lib/pricing';
import { useApp } from '@/store/app';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import type { Discounts } from '@/ui/register/useDiscounts';
import { colors, font, radius, space } from '@/ui/theme';
import { useCompact } from '@/ui/useCompact';

interface CartPanelProps {
  busy: boolean;
  discounts: Discounts;
  onEditLine: (line: CartLine) => void;
  onCharge: () => void;
}

type Tab = 'current' | 'active';

export function CartPanel({ busy, discounts, onEditLine, onCharge }: CartPanelProps) {
  const heldCount = useApp((state) => state.heldOrders.length);
  const [tab, setTab] = useState<Tab>('current');
  const compact = useCompact();

  return (
    <View style={[styles.panel, compact && styles.panelCompact]}>
      <View style={styles.tabs}>
        {(['current', 'active'] as Tab[]).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === option }}
            onPress={() => setTab(option)}
            style={[styles.tab, tab === option && styles.tabActive]}>
            <Text style={[styles.tabText, tab === option && styles.tabTextActive]}>
              {option === 'current' ? 'Current order' : 'Active'}
              {option === 'active' && heldCount > 0 ? <Text style={styles.tabCount}> {heldCount}</Text> : null}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'current' ? (
        <CurrentOrder busy={busy} discounts={discounts} onEditLine={onEditLine} onCharge={onCharge} />
      ) : (
        <ActiveOrders busy={busy} onResumed={() => setTab('current')} />
      )}
    </View>
  );
}

function CurrentOrder({ busy, discounts, onEditLine, onCharge }: CartPanelProps) {
  const cart = useApp((state) => state.cart);
  const customerName = useApp((state) => state.customerName);
  const customerPhone = useApp((state) => state.customerPhone);
  const orderNotes = useApp((state) => state.orderNotes);
  const promoCode = useApp((state) => state.promoCode);
  const { changeQuantity, clearCart, set } = useApp.getState();
  const { quote } = discounts;
  const total = quote?.netAmount ?? cartSubtotal(cart);
  const [showDetails, setShowDetails] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState(false);
  const loyaltyFilled = customerPhone.trim() !== '' || promoCode.trim() !== '';

  const subtotal = cartSubtotal(cart);
  const empty = cart.length === 0;

  return (
    <>
      {!empty ? (
        <View style={styles.header}>
          <Text style={styles.headerHint}>Not paid yet? Hold it and serve the next customer.</Text>
          <Button label="Clear" variant="ghost" onPress={clearCart} disabled={busy} />
        </View>
      ) : null}

      <FlatList
        data={cart}
        keyExtractor={(line) => line.key}
        style={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Tap items to add them.</Text>}
        renderItem={({ item: line, index }) => (
          <View style={styles.line}>
            <Pressable
              style={styles.lineInfo}
              accessibilityRole="button"
              accessibilityHint="Change options"
              onPress={() => onEditLine(line)}>
              <Text style={styles.lineName}>{line.name}</Text>
              {line.modifiers.length > 0 ? (
                <Text style={styles.lineModifiers}>{line.modifiers.map((modifier) => modifier.name).join(', ')}</Text>
              ) : null}
              <Text style={styles.linePrice}>
                {formatMoney(lineTotal(line))}
                {quote?.freeLineIndex === index ? <Text style={styles.free}>{'  '}1 free (loyalty card)</Text> : null}
              </Text>
            </Pressable>
            <View style={styles.stepper}>
              <Pressable accessibilityLabel={`Remove one ${line.name}`} onPress={() => changeQuantity(line.key, -1)} style={styles.step}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.quantity}>{line.quantity}</Text>
              <Pressable accessibilityLabel={`Add one ${line.name}`} onPress={() => changeQuantity(line.key, 1)} style={styles.step}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      {/* Loyalty/promo and name/notes fold away; staff open them only when a customer asks. */}
      <View style={styles.toggles}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showLoyalty }}
          onPress={() => setShowLoyalty((value) => !value)}
          style={styles.detailsToggle}>
          <Text style={styles.detailsToggleText}>
            {showLoyalty ? 'Hide loyalty & promo' : loyaltyFilled ? 'Loyalty & promo ✓' : 'Loyalty or promo'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          onPress={() => setShowDetails((value) => !value)}
          style={styles.detailsToggle}>
          <Text style={styles.detailsToggleText}>
            {showDetails ? 'Hide name & notes' : customerName || orderNotes ? 'Name & notes ✓' : 'Add name or notes'}
          </Text>
        </Pressable>
      </View>

      {showLoyalty ? (
        <View style={styles.loyalty}>
          <View style={styles.loyaltyFields}>
            <View style={styles.phoneField}>
              <Field label="Customer phone (loyalty card)" value={customerPhone} onChangeText={(value) => set({ customerPhone: value })} keyboardType="phone-pad" />
            </View>
            <View style={styles.codeField}>
              <Field label="Promo code" value={promoCode} onChangeText={(value) => set({ promoCode: value.toUpperCase() })} autoCapitalize="characters" autoCorrect={false} />
            </View>
          </View>
          <CardStatus discounts={discounts} phone={customerPhone} />
          {quote?.promoMessage ? <Text style={styles.warning}>{quote.promoMessage}</Text> : null}
        </View>
      ) : loyaltyFilled ? (
        // Folded but filled in: keep the free drink and any problem with the card or code in view.
        <View style={styles.loyalty}>
          {quote?.card?.rewardDueNow ? <CardStatus discounts={discounts} phone={customerPhone} /> : null}
          {discounts.error ? <Text style={styles.warning}>{discounts.error}</Text> : null}
          {quote?.promoMessage ? <Text style={styles.warning}>{quote.promoMessage}</Text> : null}
        </View>
      ) : null}
      {showDetails ? (
        <View style={styles.details}>
          <Field label="Customer name" value={customerName} onChangeText={(value) => set({ customerName: value })} />
          <Field label="Notes for the bar" value={orderNotes} onChangeText={(value) => set({ orderNotes: value })} />
        </View>
      ) : null}

      <View style={styles.totals}>
        {quote && quote.totalDiscount > 0 ? (
          <>
            <TotalLine label="Subtotal" amount={subtotal} />
            {quote.freeDrinkDiscount > 0 ? <TotalLine label="Free drink (loyalty card)" amount={-quote.freeDrinkDiscount} /> : null}
            {quote.offerDiscount > 0 ? <TotalLine label={`Offer: ${quote.offerName}`} amount={-quote.offerDiscount} /> : null}
            {quote.promoDiscount > 0 ? <TotalLine label={`Code ${quote.promoCode}`} amount={-quote.promoDiscount} /> : null}
          </>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatEgp(total)}</Text>
        </View>
        {quote?.local && quote.totalDiscount === 0 && customerPhone.trim() ? <Text style={styles.hint}>{"Offline: the loyalty card and promo codes can't be checked."}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button label="Hold" variant="secondary" onPress={() => void holdCurrentOrder()} disabled={empty || busy} />
        <Button label={`Charge ${formatMoney(total)}`} onPress={onCharge} disabled={empty || busy} busy={busy} style={styles.charge} large />
      </View>
    </>
  );
}

function TotalLine({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.discountLabel}>{label}</Text>
      <Text style={[styles.discountLabel, amount < 0 && styles.discountAmount]}>{amount < 0 ? `−${formatMoney(-amount)}` : formatMoney(amount)}</Text>
    </View>
  );
}

/** The phone's stamp card: how many stamps, and whether this order's drink is free. */
function CardStatus({ discounts, phone }: { discounts: Discounts; phone: string }) {
  const card = discounts.quote?.card;
  if (!phone.trim()) {
    return <Text style={styles.hint}>Add the phone so the order counts on their loyalty card.</Text>;
  }

  if (discounts.error) {
    return <Text style={styles.warning}>{discounts.error}</Text>;
  }

  if (!card) {
    return discounts.quote?.local ? <Text style={styles.hint}>Offline: the card is updated when the order syncs.</Text> : null;
  }

  if (!card.isActive) {
    return null;
  }

  if (card.rewardDueNow) {
    return <Text style={styles.reward}>Order {card.ordersForReward}: one drink is FREE on this order</Text>;
  }

  return (
    <Text style={styles.hint}>
      Loyalty card: {card.stamps} of {card.ordersForReward - 1} paid orders · free drink on order {card.ordersForReward}
    </Text>
  );
}

function ActiveOrders({ busy, onResumed }: { busy: boolean; onResumed: () => void }) {
  const heldOrders = useApp((state) => state.heldOrders);
  const cartInUse = useApp((state) => state.cart.length > 0);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const resume = async (order: HeldOrder) => {
    await resumeHeldOrder(order.id);
    onResumed();
  };

  return (
    <FlatList
      data={heldOrders}
      keyExtractor={(order) => order.id}
      style={styles.list}
      contentContainerStyle={styles.heldList}
      ListHeaderComponent={
        heldOrders.length > 0 && cartInUse ? (
          <Text style={styles.headerHint}>Opening one holds the order that is on the register now.</Text>
        ) : undefined
      }
      ListEmptyComponent={<Text style={styles.empty}>No orders on hold. Use Hold on the current order to put it aside until the customer is ready to pay.</Text>}
      renderItem={({ item: order }) => (
        <View style={styles.held}>
          <Pressable accessibilityRole="button" accessibilityHint="Open this order to finish and charge it" onPress={() => void resume(order)} disabled={busy} style={styles.heldMain}>
            <View style={styles.heldTop}>
              <Text style={styles.heldLabel}>{order.label}</Text>
              <Text style={styles.heldTotal}>{formatMoney(cartSubtotal(order.cart))}</Text>
            </View>
            <Text style={styles.heldItems} numberOfLines={2}>
              {order.cart.map((line) => `${line.quantity}× ${line.name}`).join(', ')}
            </Text>
            <Text style={styles.heldMeta}>Held at {formatClock(order.heldAt)} · tap to open</Text>
          </Pressable>
          <Button
            label={confirmingDelete === order.id ? 'Tap again to delete' : 'Delete'}
            variant={confirmingDelete === order.id ? 'danger' : 'ghost'}
            onPress={() => {
              if (confirmingDelete === order.id) {
                setConfirmingDelete(null);
                void discardHeldOrder(order.id);
              } else {
                setConfirmingDelete(order.id);
              }
            }}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 380,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  // Gives the register's menu cards more width on the 10.2" iPad.
  panelCompact: { width: 360, padding: space.md },
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  tabText: { fontSize: font.body, fontWeight: '700', color: colors.text },
  tabTextActive: { color: colors.primary },
  tabCount: { color: colors.warning },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  headerHint: { flex: 1, fontSize: font.small, color: colors.textMuted },
  list: { flex: 1 },
  empty: { fontSize: font.body, color: colors.textMuted, paddingVertical: space.xl, textAlign: 'center' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  lineInfo: { flex: 1, gap: 2 },
  lineName: { fontSize: font.body, fontWeight: '600', color: colors.text },
  lineModifiers: { fontSize: font.small, color: colors.textMuted },
  linePrice: { fontSize: font.body, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  step: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: font.title, color: colors.text },
  quantity: { width: 32, textAlign: 'center', fontSize: font.large, fontWeight: '700', color: colors.text },
  toggles: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  detailsToggle: { minHeight: 44, justifyContent: 'center' },
  detailsToggleText: { fontSize: font.body, fontWeight: '600', color: colors.primary },
  details: { gap: space.sm },
  totals: { gap: 2, paddingTop: space.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  discountLabel: { fontSize: font.body, color: colors.textMuted },
  discountAmount: { color: colors.success, fontWeight: '700' },
  free: { fontSize: font.small, fontWeight: '800', color: colors.success },
  loyalty: { gap: 4 },
  loyaltyFields: { flexDirection: 'row', gap: space.sm },
  phoneField: { flex: 3 },
  codeField: { flex: 2 },
  hint: { fontSize: font.small, color: colors.textMuted },
  warning: { fontSize: font.small, fontWeight: '600', color: colors.warning },
  reward: { fontSize: font.body, fontWeight: '800', color: colors.success },
  totalLabel: { fontSize: font.large, color: colors.textMuted },
  totalValue: { fontSize: font.hero, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: space.sm },
  charge: { flex: 1 },
  heldList: { gap: space.sm },
  held: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
  heldMain: { gap: space.xs },
  heldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heldLabel: { fontSize: font.large, fontWeight: '700', color: colors.text },
  heldTotal: { fontSize: font.large, fontWeight: '700', color: colors.text },
  heldItems: { fontSize: font.body, color: colors.text },
  heldMeta: { fontSize: font.small, color: colors.textMuted },
});
