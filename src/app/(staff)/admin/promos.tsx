import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { createPromo, loadAdminCatalog, loadCardSettings, loadOffers, loadPromos, saveCardSettings, saveOffer, updatePromo, type LoyaltyCardSettings } from '@/lib/admin';
import { addDays, businessDateOf, cairoTimeToUtc, formatClock, isBusinessDate, isClockTime, startOfBusinessDate, todayBusinessDate } from '@/lib/businessDay';
import type { Offer } from '@/lib/discounts';
import { formatMoney, parseMoneyInput, toEgp, toPiastres } from '@/lib/money';
import type { AdminCategory, AdminMenuItem, DiscountType, PromoCode } from '@/lib/types';
import { ChipSelect, EmptyState, formStyles, FormRow, ListRow, Panel, Segments, ToggleRow } from '@/ui/admin/AdminKit';
import { DISCOUNT_TYPE_LABELS, optionsOf, PROMO_STATE } from '@/ui/admin/labels';
import { errorMessage } from '@/ui/admin/MenuForms';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, space } from '@/ui/theme';

type Mode = 'promos' | 'offers' | 'card';
type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const money = (amount: number) => formatMoney(toPiastres(amount));

function parseAmount(text: string, label: string): number {
  const piastres = parseMoneyInput(text);
  if (piastres === null) {
    throw new Error(`${label} must be a number like 20 or 12.50.`);
  }

  return toEgp(piastres);
}

function parseCount(text: string, label: string, allowEmpty = false): number | null {
  if (allowEmpty && text.trim() === '') {
    return null;
  }

  const value = Number(text.trim());
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of 1 or more${allowEmpty ? ', or empty for no limit' : ''}.`);
  }

  return value;
}

function describePromo(promo: PromoCode) {
  const discount =
    promo.discountType === 'PERCENTAGE'
      ? `${promo.discountValue}% off${promo.maxDiscountCap ? ` (max ${money(promo.maxDiscountCap)})` : ''}`
      : `${money(promo.discountValue)} EGP off`;
  const uses = `${promo.currentUsesCount}${promo.maxTotalUses ? `/${promo.maxTotalUses}` : ''} uses`;
  return `${discount} · ${uses} · ${money(promo.totalDiscountGiven)} EGP given`;
}

export default function PromosAdminScreen() {
  const [mode, setMode] = useState<Mode>('promos');
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [card, setCard] = useState<LoyaltyCardSettings | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const fail = useCallback((error: unknown) => setFeedback({ tone: 'danger', message: errorMessage(error) }), []);

  const reload = useCallback(async () => {
    try {
      const [loadedPromos, loadedOffers] = await Promise.all([loadPromos(), loadOffers()]);
      setPromos(loadedPromos);
      setOffers(loadedOffers);
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  useEffect(() => {
    let active = true;
    Promise.all([loadPromos(), loadOffers(), loadCardSettings(), loadAdminCatalog()])
      .then(([loadedPromos, loadedOffers, loadedCard, catalog]) => {
        if (active) {
          setPromos(loadedPromos);
          setOffers(loadedOffers);
          setCard(loadedCard);
          setCategories(catalog.categories);
          setItems(catalog.items);
        }
      })
      .catch((error) => active && fail(error));
    return () => {
      active = false;
    };
  }, [fail]);

  const saved = (id: string, message: string) => {
    void reload();
    setEditing(id);
    setFeedback({ tone: 'success', message });
  };

  const open = (id: string | 'new' | null) => {
    setEditing(id);
    setFeedback(null);
  };

  const promo = mode === 'promos' && editing && editing !== 'new' ? promos?.find((candidate) => candidate.id === editing) ?? null : null;
  const offer = mode === 'offers' && editing && editing !== 'new' ? offers?.find((candidate) => candidate.id === editing) ?? null : null;

  return (
    <View style={styles.screen}>
      <Segments
        options={[
          { value: 'promos', label: 'Promo codes' },
          { value: 'offers', label: 'Offers' },
          { value: 'card', label: 'Loyalty card' },
        ]}
        value={mode}
        onChange={(value: Mode) => {
          setMode(value);
          open(null);
        }}
      />
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <View style={styles.columns}>
        {mode === 'promos' ? (
          <Panel title="Promo codes" style={styles.list} action={<Button label="+ New code" onPress={() => open('new')} />}>
            {(promos ?? []).map((candidate) => (
              <ListRow
                key={candidate.id}
                title={candidate.code}
                subtitle={describePromo(candidate)}
                badge={PROMO_STATE[candidate.state].label}
                badgeTone={PROMO_STATE[candidate.state].tone}
                selected={candidate.id === editing}
                onPress={() => open(candidate.id)}
              />
            ))}
            {promos?.length === 0 ? <EmptyState message="No promo codes yet. Customers enter these on the website." /> : null}
          </Panel>
        ) : mode === 'offers' ? (
          <Panel title="Offers" style={styles.list} action={<Button label="+ New offer" onPress={() => open('new')} />}>
            {(offers ?? []).map((candidate) => (
              <ListRow
                key={candidate.id}
                title={candidate.name}
                subtitle={describeOffer(candidate)}
                badge={offerState(candidate).label}
                badgeTone={offerState(candidate).tone}
                selected={candidate.id === editing}
                onPress={() => open(candidate.id)}
              />
            ))}
            {offers?.length === 0 ? <EmptyState message="No offers yet. An offer applies by itself, e.g. Halloween 20% off on 31 October." /> : null}
          </Panel>
        ) : null}

        <View style={styles.editor}>
          {mode === 'promos' && editing ? (
            <PromoForm key={editing} promo={promo} onSaved={saved} onError={fail} />
          ) : mode === 'offers' && editing ? (
            <OfferForm key={editing} offer={offer} categories={categories} items={items} onSaved={saved} onError={fail} />
          ) : mode === 'card' && card ? (
            <CardForm
              settings={card}
              onSaved={(updated) => {
                setCard(updated);
                setFeedback({ tone: 'success', message: 'Loyalty card saved.' });
              }}
              onError={fail}
            />
          ) : (
            <Panel>
              <EmptyState message={mode === 'promos' ? 'Pick a promo code to edit it, or create a new one.' : 'Pick an offer to edit it, or create a new one.'} />
            </Panel>
          )}
        </View>
      </View>
    </View>
  );
}

function describeOffer(offer: Offer) {
  const amount = offer.discountType === 'PERCENTAGE' ? `${offer.discountValue}% off` : `${money(offer.discountValue)} EGP off`;
  const scope = offer.appliesToWholeOrder ? 'whole order' : `${offer.categoryIds.length + offer.menuItemIds.length} chosen`;
  const hours = offer.dailyStart ? ` · ${offer.dailyStart}–${offer.dailyEnd}` : '';
  const from = businessDateOf(new Date(offer.startsAt));
  const to = businessDateOf(new Date(new Date(offer.endsAt).getTime() - 1));
  return `${amount} · ${scope} · ${from === to ? from : `${from} to ${to}`}${hours}`;
}

function offerState(offer: Offer): { label: string; tone: 'success' | 'muted' | 'danger' | 'accent' } {
  const now = Date.now();
  if (!offer.isActive) {
    return { label: 'Off', tone: 'danger' };
  }

  if (new Date(offer.endsAt).getTime() <= now) {
    return { label: 'Ended', tone: 'muted' };
  }

  return new Date(offer.startsAt).getTime() > now ? { label: 'Coming', tone: 'accent' } : { label: 'Running', tone: 'success' };
}

/** An automatic offer: no code, it applies by itself on its days (and hours), at the register and/or on the website. */
function OfferForm({ offer, categories, items, onSaved, onError }: {
  offer: Offer | null;
  categories: AdminCategory[];
  items: AdminMenuItem[];
  onSaved: (id: string, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState(offer?.name ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(offer?.discountType ?? 'PERCENTAGE');
  const [value, setValue] = useState(offer ? String(offer.discountValue) : '');
  const [wholeOrder, setWholeOrder] = useState(offer?.appliesToWholeOrder ?? true);
  const [categoryIds, setCategoryIds] = useState<string[]>(offer?.categoryIds ?? []);
  const [itemIds, setItemIds] = useState<string[]>(offer?.menuItemIds ?? []);
  const [firstDay, setFirstDay] = useState(offer ? businessDateOf(new Date(offer.startsAt)) : todayBusinessDate());
  const [startTime, setStartTime] = useState(offer ? formatClock(offer.startsAt) : '00:00');
  const [lastDay, setLastDay] = useState(offer ? businessDateOf(new Date(new Date(offer.endsAt).getTime() - 1)) : todayBusinessDate());
  const [endTime, setEndTime] = useState(offer ? endClock(offer.endsAt) : '23:59');
  const [dailyStart, setDailyStart] = useState(offer?.dailyStart ?? '');
  const [dailyEnd, setDailyEnd] = useState(offer?.dailyEnd ?? '');
  const [onPos, setOnPos] = useState(offer?.validOnPos ?? true);
  const [onWeb, setOnWeb] = useState(offer?.validOnWeb ?? true);
  const [isActive, setIsActive] = useState(offer?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((candidate) => candidate !== id) : [...list, id]);
  const shownItems = categoryIds.length > 0 ? items.filter((item) => !categoryIds.includes(item.categoryId)) : items;

  const save = async () => {
    setBusy(true);
    try {
      if (!isBusinessDate(firstDay) || !isBusinessDate(lastDay) || !isClockTime(startTime) || !isClockTime(endTime)) {
        throw new Error('Days look like 2026-10-31 and times like 08:00 (24-hour).');
      }

      if ((dailyStart.trim() || dailyEnd.trim()) && (!isClockTime(dailyStart) || !isClockTime(dailyEnd))) {
        throw new Error('Daily hours look like 15:00 to 17:00, or leave both empty for all day.');
      }

      // "23:59" on the last day means up to the end of that day.
      const endsAt = endTime.trim() === '23:59' ? startOfBusinessDate(addDays(lastDay.trim(), 1)) : cairoTimeToUtc(lastDay.trim(), endTime.trim());
      const result = await saveOffer(offer?.id ?? null, {
        name: name.trim(),
        discountType,
        discountValue: parseAmount(value, discountType === 'PERCENTAGE' ? 'Percent' : 'Amount'),
        appliesToWholeOrder: wholeOrder,
        categoryIds: wholeOrder ? [] : categoryIds,
        menuItemIds: wholeOrder ? [] : itemIds,
        startsAt: cairoTimeToUtc(firstDay.trim(), startTime.trim()).toISOString(),
        endsAt: endsAt.toISOString(),
        dailyStart: dailyStart.trim() || null,
        dailyEnd: dailyEnd.trim() || null,
        validOnPos: onPos,
        validOnWeb: onWeb,
        isActive,
      });
      onSaved(result.id, offer ? `${result.name} was updated.` : `${result.name} was created. It applies by itself.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={offer ? `Offer: ${offer.name}` : 'New offer'}>
      <Field label="Name (shown on the receipt)" value={name} onChangeText={setName} placeholder="Halloween" />
      <ChipSelect label="Discount" options={optionsOf(DISCOUNT_TYPE_LABELS)} selected={[discountType]} onToggle={setDiscountType} />
      <Field label={discountType === 'PERCENTAGE' ? 'Percent off' : 'Amount off (EGP)'} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      <ToggleRow label="Whole order" hint="Turn off to choose categories or items." value={wholeOrder} onChange={setWholeOrder} />
      {wholeOrder ? null : (
        <>
          <ChipSelect label="Categories" options={categories.map((category) => ({ value: category.id, label: category.name }))} selected={categoryIds} onToggle={(id) => setCategoryIds((list) => toggle(list, id))} />
          <ChipSelect label="Or single items" options={shownItems.map((item) => ({ value: item.id, label: item.name }))} selected={itemIds} onToggle={(id) => setItemIds((list) => toggle(list, id))} />
        </>
      )}
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="First day" value={firstDay} onChangeText={setFirstDay} placeholder="2026-10-31" autoCorrect={false} />
        </View>
        <View style={formStyles.grow}>
          <Field label="From" value={startTime} onChangeText={setStartTime} placeholder="00:00" />
        </View>
        <View style={formStyles.grow}>
          <Field label="Last day" value={lastDay} onChangeText={setLastDay} placeholder="2026-10-31" autoCorrect={false} />
        </View>
        <View style={formStyles.grow}>
          <Field label="Until" value={endTime} onChangeText={setEndTime} placeholder="23:59" />
        </View>
      </FormRow>
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Every day from (optional)" value={dailyStart} onChangeText={setDailyStart} placeholder="15:00" />
        </View>
        <View style={formStyles.grow}>
          <Field label="Every day until (optional)" value={dailyEnd} onChangeText={setDailyEnd} placeholder="17:00" />
        </View>
      </FormRow>
      <ToggleRow label="At the register" value={onPos} onChange={setOnPos} />
      <ToggleRow label="On the website" value={onWeb} onChange={setOnWeb} />
      {offer ? <ToggleRow label="Enabled" hint="Turn off to stop it now." value={isActive} onChange={setIsActive} /> : null}
      <Text style={styles.hint}>
        No code needed: during its days (and hours), the register and website take it off by themselves. If two offers run at once, the bigger one is
        used; a promo code is only used when it gives more than the offer.
      </Text>
      <Button label={offer ? 'Save offer' : 'Create offer'} onPress={() => void save()} busy={busy} large />
    </Panel>
  );
}

/** The time an offer ends, shown as the last minute it runs ("23:59" for the end of a day). */
function endClock(endsAt: string): string {
  const time = formatClock(endsAt);
  return time === '00:00' ? '23:59' : time;
}

function CardForm({ settings, onSaved, onError }: {
  settings: LoyaltyCardSettings;
  onSaved: (settings: LoyaltyCardSettings) => void;
  onError: (error: unknown) => void;
}) {
  const [orders, setOrders] = useState(String(settings.ordersForReward));
  const [cap, setCap] = useState(settings.freeDrinkCap ? money(settings.freeDrinkCap) : '');
  const [isActive, setIsActive] = useState(settings.isActive);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const ordersForReward = parseCount(orders, 'The free order') ?? 9;
      if (ordersForReward < 2) {
        throw new Error('The free drink comes on order 2 or later.');
      }

      onSaved(await saveCardSettings({ ordersForReward, freeDrinkCap: cap.trim() ? parseAmount(cap, 'Cap') : null, isActive }));
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Loyalty card">
      <Field label="Free drink on order number" value={orders} onChangeText={setOrders} keyboardType="number-pad" />
      <Field label="Most the free drink can cover (EGP, optional)" value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder="No limit" />
      <ToggleRow label="Card is running" value={isActive} onChange={setIsActive} />
      <Text style={styles.hint}>
        {`Every paid order with the customer's phone (at the register or on the website) is a stamp. On order ${orders || 'N'}, the most expensive drink is free${cap.trim() ? ` (up to ${cap} EGP)` : ''}: the register shows it and takes it off by itself. Then the card starts again.`}
      </Text>
      <Button label="Save loyalty card" onPress={() => void save()} busy={busy} large />
    </Panel>
  );
}

function PromoForm({ promo, onSaved, onError }: {
  promo: PromoCode | null;
  onSaved: (id: string, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [code, setCode] = useState(promo?.code ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(promo?.discountType ?? 'PERCENTAGE');
  const [value, setValue] = useState(promo ? String(promo.discountValue) : '');
  const [cap, setCap] = useState(promo?.maxDiscountCap ? money(promo.maxDiscountCap) : '');
  const [minOrder, setMinOrder] = useState(promo ? money(promo.minOrderAmount) : '0');
  const [maxUses, setMaxUses] = useState(promo?.maxTotalUses ? String(promo.maxTotalUses) : '');
  const [perCustomer, setPerCustomer] = useState(String(promo?.maxUsesPerCustomer ?? 1));
  const [starts, setStarts] = useState(promo ? businessDateOf(new Date(promo.startsAt)) : todayBusinessDate());
  // Expiry is stored as the instant the day after ends, so show the last valid day.
  const [ends, setEnds] = useState(promo?.expiresAt ? businessDateOf(new Date(new Date(promo.expiresAt).getTime() - 1)) : '');
  const [isActive, setIsActive] = useState(promo?.isActive ?? true);
  const [onPos, setOnPos] = useState(promo?.isValidOnPos ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (!isBusinessDate(starts) || (ends.trim() && !isBusinessDate(ends))) {
        throw new Error('Dates must look like 2026-11-30.');
      }

      const body = {
        discountType,
        discountValue: parseAmount(value, discountType === 'PERCENTAGE' ? 'Percent' : 'Amount'),
        maxDiscountCap: discountType === 'PERCENTAGE' && cap.trim() ? parseAmount(cap, 'Maximum discount') : null,
        minOrderAmount: minOrder.trim() ? parseAmount(minOrder, 'Minimum order') : 0,
        maxTotalUses: parseCount(maxUses, 'Total uses', true),
        maxUsesPerCustomer: parseCount(perCustomer, 'Uses per customer') ?? 1,
        startsAt: startOfBusinessDate(starts.trim()).toISOString(),
        expiresAt: ends.trim() ? startOfBusinessDate(addDays(ends.trim(), 1)).toISOString() : null,
        isValidOnPos: onPos,
      };
      const result = promo ? await updatePromo(promo.id, { ...body, isActive }) : await createPromo({ ...body, code: code.trim().toUpperCase() });
      onSaved(result.id, promo ? `${result.code} was updated.` : `${result.code} was created.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={promo ? `Promo code ${promo.code}` : 'New promo code'}>
      {promo ? null : (
        <Field
          label="Code"
          hint="3–50 letters, digits, - or _. Customers type this at checkout."
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="WELCOME10"
        />
      )}
      <ChipSelect label="Discount" options={optionsOf(DISCOUNT_TYPE_LABELS)} selected={[discountType]} onToggle={setDiscountType} />
      <FormRow>
        <View style={formStyles.grow}>
          <Field label={discountType === 'PERCENTAGE' ? 'Percent off' : 'Amount off (EGP)'} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
        </View>
        {discountType === 'PERCENTAGE' ? (
          <View style={formStyles.grow}>
            <Field label="Maximum discount (EGP, optional)" value={cap} onChangeText={setCap} keyboardType="decimal-pad" />
          </View>
        ) : null}
        <View style={formStyles.grow}>
          <Field label="Minimum order (EGP)" value={minOrder} onChangeText={setMinOrder} keyboardType="decimal-pad" />
        </View>
      </FormRow>
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Total uses (empty = no limit)" value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" />
        </View>
        <View style={formStyles.grow}>
          <Field label="Uses per customer" value={perCustomer} onChangeText={setPerCustomer} keyboardType="number-pad" />
        </View>
      </FormRow>
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Starts on" value={starts} onChangeText={setStarts} placeholder="2026-11-01" autoCorrect={false} />
        </View>
        <View style={formStyles.grow}>
          <Field label="Last day (empty = never ends)" value={ends} onChangeText={setEnds} placeholder="2026-11-30" autoCorrect={false} />
        </View>
      </FormRow>
      <ToggleRow label="Can be used at the register" hint="The cashier types it in the cart; the customer's phone is needed." value={onPos} onChange={setOnPos} />
      {promo ? <ToggleRow label="Enabled" hint="Turn off to stop the code immediately." value={isActive} onChange={setIsActive} /> : null}
      <Text style={styles.hint}>
        {"On the website only signed-in customers with a verified email can use codes. A code and an offer don't add up: the bigger discount is used."}
      </Text>
      <Button label={promo ? 'Save promo code' : 'Create promo code'} onPress={() => void save()} busy={busy} large />
    </Panel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { width: 420 },
  editor: { flex: 1 },
  hint: { fontSize: font.small, color: colors.textMuted },
});
