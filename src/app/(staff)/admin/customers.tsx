import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatReceiptTime } from '@/lib/businessDay';
import { loadCustomerOrders, loadCustomers, type CustomerSort, type CustomerSource } from '@/lib/customers';
import type { LoyaltyCustomer, LoyaltyCustomerList, LoyaltyCustomerOrder } from '@/lib/types';
import { EmptyState, ListRow, Panel, Segments } from '@/ui/admin/AdminKit';
import { errorMessage } from '@/ui/admin/MenuForms';
import { Banner } from '@/ui/Banner';
import { Field } from '@/ui/Field';
import { CHANNEL_LABELS, STATUS_LABELS } from '@/ui/orders/ServerOrderPanel';
import { egp, KpiRow, StatTile } from '@/ui/reports/ReportKit';
import { colors, font, radius, space } from '@/ui/theme';

const SOURCES: { value: CustomerSource; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'website', label: 'Website accounts' },
  { value: 'instore', label: 'In-store only' },
];

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'recent', label: 'Last visit' },
  { value: 'orders', label: 'Most orders' },
  { value: 'spent', label: 'Top spenders' },
  { value: 'stamps', label: 'Most stamps' },
  { value: 'newest', label: 'Newest' },
];

const displayName = (customer: LoyaltyCustomer) => customer.fullName?.trim() || customer.phone || customer.email || 'Unnamed customer';

// Admin → Customers (admins only): everyone on the stamp card, from the register (phone only) and the website
// (accounts, merged with their in-store profile by phone). Orders and spend count the orders that earn stamps.
export default function CustomersScreen() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<CustomerSource>('all');
  const [sort, setSort] = useState<CustomerSort>('recent');
  const [data, setData] = useState<LoyaltyCustomerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    loadCustomers(query, source, sort)
      .then((loaded) => {
        if (active) {
          setData(loaded);
          setError(null);
        }
      })
      .catch((loadError) => active && setError(errorMessage(loadError)));
    return () => {
      active = false;
    };
  }, [query, source, sort]);

  const customers = data?.customers ?? [];
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  return (
    <View style={styles.screen}>
      {error ? <Banner tone="danger" message={error} /> : null}
      {data && !data.cardIsActive ? <Banner tone="warning" message="The stamp card is turned off (Admin → Promos & loyalty), so no free drinks are given." /> : null}
      <KpiRow>
        <StatTile label="Loyalty customers" value={String(data?.totalCustomers ?? '—')} caption="Register and website" />
        <StatTile label="Website accounts" value={String(data?.websiteAccounts ?? '—')} />
        <StatTile
          label="Free drink due"
          value={String(data?.rewardsDue ?? '—')}
          caption={data ? `On their next order (every ${data.ordersForReward}th)` : undefined}
        />
      </KpiRow>

      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Field label="Find" value={search} onChangeText={setSearch} placeholder="Name, phone or email" autoCorrect={false} autoCapitalize="none" />
        </View>
        <Segments options={SOURCES} value={source} onChange={setSource} />
      </View>
      <Segments options={SORTS} value={sort} onChange={setSort} />

      <View style={styles.columns}>
        <Panel title={`Customers (${customers.length}${data && data.totalCustomers > customers.length ? ` of ${data.totalCustomers}` : ''})`} style={styles.list}>
          {customers.map((customer) => (
            <ListRow
              key={customer.id}
              title={displayName(customer)}
              subtitle={[
                customer.fullName ? customer.phone : null,
                `${customer.inStoreOrders + customer.websiteOrders} orders`,
                `${customer.stamps}/${(data?.ordersForReward ?? 1) - 1} stamps`,
              ]
                .filter(Boolean)
                .join(' · ')}
              badge={customer.rewardDue ? 'Free drink due' : customer.hasWebsiteAccount ? 'Website' : null}
              badgeTone={customer.rewardDue ? 'accent' : 'muted'}
              selected={customer.id === selectedId}
              onPress={() => setSelectedId(customer.id)}
            />
          ))}
          {data && customers.length === 0 ? (
            <EmptyState message={query ? 'No customer matches that search.' : 'No loyalty customers yet. They appear once a phone is added to an order or someone signs up on the website.'} />
          ) : null}
        </Panel>

        <View style={styles.detail}>
          {selected && data ? (
            <CustomerDetails key={selected.id} customer={selected} ordersForReward={data.ordersForReward} />
          ) : (
            <Panel scroll={false}>
              <EmptyState message="Pick a customer to see their stamp card and orders." />
            </Panel>
          )}
        </View>
      </View>
    </View>
  );
}

function CustomerDetails({ customer, ordersForReward }: { customer: LoyaltyCustomer; ordersForReward: number }) {
  const [orders, setOrders] = useState<LoyaltyCustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stampsNeeded = Math.max(1, ordersForReward - 1);

  useEffect(() => {
    let active = true;
    loadCustomerOrders(customer.id)
      .then((loaded) => active && setOrders(loaded))
      .catch((loadError) => active && setError(errorMessage(loadError)));
    return () => {
      active = false;
    };
  }, [customer.id]);

  return (
    <Panel title={displayName(customer)}>
      <View style={styles.facts}>
        <Fact label="Phone" value={customer.phone ?? '—'} />
        <Fact label="Email" value={customer.email ? `${customer.email}${customer.emailVerified ? ' (verified)' : ' (not verified)'}` : '—'} />
        <Fact label="Joined from" value={customer.hasWebsiteAccount ? 'Website account' : 'Register (phone only)'} />
        <Fact label="Customer since" value={formatReceiptTime(customer.createdAt)} />
        <Fact label="Last order" value={customer.lastOrderAt ? formatReceiptTime(customer.lastOrderAt) : 'No orders yet'} />
      </View>

      <KpiRow>
        <StatTile label="In-store orders" value={String(customer.inStoreOrders)} />
        <StatTile label="Website orders" value={String(customer.websiteOrders)} />
        <StatTile label="Spent (EGP)" value={egp(customer.totalSpent)} />
        <StatTile label="Free drinks had" value={String(customer.freeDrinksRedeemed)} />
      </KpiRow>

      <Text style={styles.section}>Stamp card</Text>
      <View style={styles.stamps}>
        {Array.from({ length: stampsNeeded }, (_, index) => (
          <View key={index} style={[styles.stamp, index < customer.stamps && styles.stampOn]} />
        ))}
        <View style={[styles.stamp, styles.stampReward, customer.rewardDue && styles.stampRewardDue]}>
          <Text style={[styles.stampRewardText, customer.rewardDue && styles.stampRewardTextDue]}>Free</Text>
        </View>
      </View>
      <Text style={styles.meta}>
        {customer.rewardDue
          ? 'Their next order gets the most expensive drink free (applied automatically).'
          : `${customer.stamps} of ${stampsNeeded} stamps. ${stampsNeeded - customer.stamps} more paid order(s) until a free drink.`}
      </Text>

      <Text style={styles.section}>Recent orders</Text>
      {error ? <Banner tone="danger" message={error} /> : null}
      {orders?.length === 0 ? <Text style={styles.meta}>No orders yet.</Text> : null}
      {orders?.map((order) => (
        <View key={order.id} style={styles.orderRow}>
          <Text style={styles.orderWhen}>{formatReceiptTime(order.createdAt)}</Text>
          <Text style={styles.orderWhat}>
            {order.displayCode} · {CHANNEL_LABELS[order.channel]}
            {order.countsAsStamp ? '' : ` · ${STATUS_LABELS[order.status]}${order.paymentStatus === 'REFUNDED' ? ' (refunded)' : ''}, no stamp`}
            {order.hadFreeDrink ? ' · free drink' : ''}
          </Text>
          <Text style={styles.orderAmount}>
            {egp(order.netAmountDue - order.refunded)}
            {order.refunded > 0 ? `\n−${egp(order.refunded)} refunded` : ''}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  toolbar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg, flexWrap: 'wrap' },
  search: { width: 320 },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { width: 400 },
  detail: { flex: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  fact: { minWidth: 180, gap: 2 },
  factLabel: { fontSize: font.small, color: colors.textMuted },
  factValue: { fontSize: font.body, fontWeight: '600', color: colors.text },
  section: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: space.sm },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stamp: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  stampOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stampReward: { width: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  stampRewardDue: { backgroundColor: colors.accent, borderColor: colors.accent, borderStyle: 'solid' },
  stampRewardText: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  stampRewardTextDue: { color: colors.onAccent },
  meta: { fontSize: font.small, color: colors.textMuted },
  orderRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderWhen: { width: 130, fontSize: font.small, color: colors.textMuted },
  orderWhat: { flex: 1, fontSize: font.small, color: colors.text },
  orderAmount: { width: 120, textAlign: 'right', fontSize: font.small, color: colors.text, fontVariant: ['tabular-nums'] },
});
