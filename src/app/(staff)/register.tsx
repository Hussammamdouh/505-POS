import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/lib/api';
import { byPopularity } from '@/lib/catalog';
import { CheckoutRejected, placeOrder, type CheckoutResult } from '@/lib/checkout';
import type { LocalOrderPayment } from '@/lib/localOrder';
import { formatEgp, formatMoney, toPiastres } from '@/lib/money';
import { canQuickAdd, cartSubtotal, defaultSelection, toCartLine, type CartLine } from '@/lib/pricing';
import { printOrderReceipt } from '@/lib/printing/printer';
import type { CatalogItem } from '@/lib/types';
import { useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { CartPanel } from '@/ui/register/CartPanel';
import { useDiscounts } from '@/ui/register/useDiscounts';
import { ModifierSheet } from '@/ui/register/ModifierSheet';
import { PaymentSheet } from '@/ui/register/PaymentSheet';
import { colors, font, radius, space } from '@/ui/theme';
import { useCompact } from '@/ui/useCompact';

export default function RegisterScreen() {
  const catalog = useApp((state) => state.catalog);
  const cart = useApp((state) => state.cart);
  const popularity = useApp((state) => state.popularity);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ item: CatalogItem; editing: CartLine | null } | null>(null);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [menuWidth, setMenuWidth] = useState(0);
  const compact = useCompact();
  const discounts = useDiscounts();
  const cardWidth = Math.floor((menuWidth - GRID_PADDING * 2 - GRID_GAP * (MENU_COLUMNS - 1)) / MENU_COLUMNS);

  const category = catalog.find((candidate) => candidate.id === categoryId) ?? catalog[0];
  const activeCategoryId = category?.id ?? null;
  // Most ordered first, so the favourites are always in the top row.
  const items = byPopularity(category?.items ?? [], popularity);
  const topSellers = new Set(items.slice(0, 3).filter((item) => (popularity[item.id] ?? 0) > 0).map((item) => item.id));

  const quickAdd = (item: CatalogItem) => {
    if (canQuickAdd(item)) {
      useApp.getState().addToCart(toCartLine(item, defaultSelection(item), 1));
    } else {
      setPicking({ item, editing: null });
    }
  };

  const editLine = (line: CartLine) => {
    const item = catalog.flatMap((candidate) => candidate.items).find((candidate) => candidate.id === line.menuItemId);
    if (item && item.modifierGroups.length > 0) {
      setPicking({ item, editing: line });
    }
  };

  const saveLine = (line: CartLine) => {
    if (picking?.editing) {
      useApp.getState().replaceLine(picking.editing.key, line);
    } else {
      useApp.getState().addToCart(line);
    }
    setPicking(null);
  };

  const checkout = async (payments: LocalOrderPayment[]) => {
    const state = useApp.getState();
    setBusy(true);
    setError(null);
    try {
      const outcome = await placeOrder({
        lines: state.cart,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        orderNotes: state.orderNotes,
        payments,
        quote: discounts.quote,
      });
      state.clearCart();
      setPaying(false);
      setResult(outcome);
    } catch (checkoutError) {
      setError(describeError(checkoutError));
      if (checkoutError instanceof CheckoutRejected && checkoutError.menuRefreshed) {
        setPaying(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={[styles.categories, compact && styles.categoriesCompact]} contentContainerStyle={styles.categoryList}>
        {catalog.map((candidate) => {
          const active = candidate.id === activeCategoryId;
          return (
            <Pressable
              key={candidate.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setCategoryId(candidate.id)}
              style={[styles.category, active && styles.categoryActive]}>
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{candidate.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.menu} onLayout={(event) => setMenuWidth(event.nativeEvent.layout.width)}>
        {error && !paying ? (
          <View style={styles.menuBanner}>
            <Banner tone="danger" message={error} />
          </View>
        ) : null}
        {menuWidth === 0 ? null : catalog.length === 0 ? (
          <Text style={styles.emptyMenu}>The menu has not been downloaded yet. Connect to the internet once so this iPad can save it.</Text>
        ) : (
          <FlatList
            key={activeCategoryId ?? 'none'}
            data={items}
            keyExtractor={(item) => item.id}
            numColumns={MENU_COLUMNS}
            columnWrapperStyle={styles.itemRow}
            contentContainerStyle={styles.itemGrid}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${formatMoney(toPiastres(item.basePrice))} pounds`}
                accessibilityHint={item.modifierGroups.length > 0 ? 'Tap to add with default options. Hold to customize.' : undefined}
                onPress={() => quickAdd(item)}
                onLongPress={() => item.modifierGroups.length > 0 && setPicking({ item, editing: null })}
                delayLongPress={350}
                style={({ pressed }) => [styles.item, { width: cardWidth }, pressed && styles.itemPressed]}>
                {topSellers.has(item.id) ? <Text style={styles.topSeller}>★ Popular</Text> : null}
                <Text style={[styles.itemName, compact && styles.itemNameCompact]} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={styles.itemFooter}>
                  <Text style={styles.itemPrice}>{formatMoney(toPiastres(item.basePrice))}</Text>
                  {item.modifierGroups.length > 0 ? <Text style={styles.itemHint}>hold for options</Text> : null}
                </View>
              </Pressable>
            )}
          />
        )}
      </View>

      <CartPanel
        busy={busy || discounts.loading}
        discounts={discounts}
        onEditLine={editLine}
        onCharge={() => {
          setError(null);
          setPaying(true);
        }}
      />

      {picking ? (
        <ModifierSheet
          key={picking.editing?.key ?? picking.item.id}
          item={picking.item}
          initialSelection={picking.editing?.modifiers.map((modifier) => modifier.id)}
          initialQuantity={picking.editing?.quantity}
          submitVerb={picking.editing ? 'Update' : 'Add'}
          onClose={() => setPicking(null)}
          onAdd={saveLine}
        />
      ) : null}
      {paying ? (
        <PaymentSheet
          amountDue={discounts.quote?.netAmount ?? cartSubtotal(cart)}
          busy={busy}
          error={error}
          onConfirm={(payments) => void checkout(payments)}
          onClose={() => setPaying(false)}
        />
      ) : null}
      {result ? <OrderPlacedDialog key={result.order.id} result={result} onClose={() => setResult(null)} /> : null}
    </View>
  );
}

function OrderPlacedDialog({ result, onClose }: { result: CheckoutResult; onClose: () => void }) {
  const [printError, setPrintError] = useState<string | null>(result.printError);
  const [reprinting, setReprinting] = useState(false);

  const retryPrint = async () => {
    const settings = useApp.getState().settings;
    if (!settings) {
      return;
    }

    setReprinting(true);
    try {
      await printOrderReceipt(settings, result.order);
      setPrintError(null);
    } catch (error) {
      setPrintError(describeError(error));
    } finally {
      setReprinting(false);
    }
  };

  const change = result.order.payments.reduce((sum, payment) => sum + payment.changeGiven, 0);
  const paid = result.order.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={dialog.backdrop}>
        <View style={dialog.card}>
          <Text style={dialog.label}>Order</Text>
          <Text style={dialog.code}>{result.order.displayCode}</Text>
          {result.offline ? <Banner tone="warning" message="Saved offline. It will sync when the internet is back." /> : null}
          {paid < result.order.netAmountDue ? (
            <Banner tone="warning" message={`Not paid yet: ${formatEgp(result.order.netAmountDue - paid)} due.`} />
          ) : null}
          {change > 0 ? <Text style={dialog.change}>Give change: {formatEgp(change)}</Text> : null}
          {printError ? <Banner tone="danger" message={`Printing failed: ${printError}`} /> : null}
          <View style={dialog.actions}>
            {printError ? <Button label="Retry print" variant="secondary" onPress={() => void retryPrint()} busy={reprinting} /> : null}
            <Button label="New order" onPress={onClose} style={dialog.done} large />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const MENU_COLUMNS = 3;
const GRID_PADDING = space.md;
const GRID_GAP = space.md;

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row' },
  categories: { width: 200, flexGrow: 0, backgroundColor: colors.surfaceMuted },
  // On the 10.2" iPad the categories and cart give up width so the three card columns stay readable.
  categoriesCompact: { width: 150 },
  categoryList: { padding: space.sm, gap: space.xs },
  category: { minHeight: 56, borderRadius: radius.sm, paddingHorizontal: space.md, justifyContent: 'center' },
  categoryActive: { backgroundColor: colors.surface },
  categoryText: { fontSize: font.body, fontWeight: '600', color: colors.textMuted },
  categoryTextActive: { color: colors.primary },
  menu: { flex: 1 },
  menuBanner: { padding: space.md, paddingBottom: 0 },
  emptyMenu: { fontSize: font.large, color: colors.textMuted, padding: space.xxl },
  itemGrid: { padding: GRID_PADDING, gap: GRID_GAP },
  itemRow: { gap: GRID_GAP },
  // Every card is the same size (width set from the menu width), whatever the name length.
  item: {
    height: 132,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  itemPressed: { backgroundColor: colors.selected },
  itemNameCompact: { fontSize: 17, lineHeight: 22 },
  topSeller: { fontSize: 12, fontWeight: '800', color: colors.accent },
  itemName: { fontSize: font.large, fontWeight: '600', color: colors.text },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  itemPrice: { fontSize: font.body, color: colors.textMuted },
  itemHint: { fontSize: 12, color: colors.textMuted },
});

const dialog = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center' },
  card: { width: 460, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md, alignItems: 'stretch' },
  label: { fontSize: font.body, color: colors.textMuted, textAlign: 'center' },
  code: { fontSize: 48, fontWeight: '800', color: colors.text, textAlign: 'center' },
  change: { fontSize: font.title, fontWeight: '700', color: colors.success, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.sm },
  done: { flex: 1 },
});
