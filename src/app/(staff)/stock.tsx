import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { refreshCatalog } from '@/lib/catalog';
import type { StockBoard } from '@/lib/types';
import { canManage, useApp } from '@/store/app';
import { Segments } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Field } from '@/ui/Field';
import { IngredientLevels } from '@/ui/inventory/IngredientLevels';
import { ShipmentForm } from '@/ui/inventory/ShipmentForm';
import { colors, font, radius, space } from '@/ui/theme';

type Kind = 'items' | 'modifiers';
type Mode = 'menu' | 'delivery' | 'ingredients';

interface StockRow {
  id: string;
  name: string;
  group: string;
  isInStock: boolean;
}

export default function StockScreen() {
  const [board, setBoard] = useState<StockBoard | null>(null);
  const manager = canManage(useApp((state) => state.session));
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [mode, setMode] = useState<Mode>(view === 'delivery' ? 'delivery' : 'menu');
  // Cashiers switch items in and out of stock and receive deliveries; ingredient levels and waste are for managers.
  const modes: { value: Mode; label: string }[] = [
    { value: 'menu', label: 'Sold-out switches' },
    { value: 'delivery', label: 'Receive delivery' },
    ...(manager ? [{ value: 'ingredients' as const, label: 'Ingredients' }] : []),
  ];
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<StockBoard>('GET', '/api/v1/admin/stock')
      .then((loaded) => active && setBoard(loaded))
      .catch((loadError) => active && setError(loadError instanceof NetworkError ? 'The stock list needs the internet.' : describeError(loadError)));
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (kind: Kind, row: StockRow, isInStock: boolean) => {
    setSaving(row.id);
    setError(null);
    try {
      await apiRequest('PATCH', `/api/v1/admin/${kind === 'items' ? 'items' : 'modifiers'}/${row.id}/stock`, { body: { isInStock } });
      setBoard((current) =>
        current && {
          ...current,
          [kind]: current[kind].map((entry) => (entry.id === row.id ? { ...entry, isInStock } : entry)),
        },
      );
      void refreshCatalog().catch(() => undefined);
    } catch (toggleError) {
      setError(toggleError instanceof NetworkError ? 'Changing stock needs the internet.' : describeError(toggleError));
    } finally {
      setSaving(null);
    }
  };

  const matches = (row: StockRow) => {
    const needle = filter.trim().toLowerCase();
    return !needle || row.name.toLowerCase().includes(needle) || row.group.toLowerCase().includes(needle);
  };

  const items: StockRow[] = (board?.items ?? []).map((item) => ({ ...item, group: item.categoryName })).filter(matches);
  const modifiers: StockRow[] = (board?.modifiers ?? []).map((modifier) => ({ ...modifier, group: modifier.groupName })).filter(matches);
  const soldOut = [...(board?.items ?? []), ...(board?.modifiers ?? [])].filter((row) => !row.isInStock).length;

  if (mode !== 'menu') {
    return (
      <View style={styles.screen}>
        <Segments options={modes} value={mode} onChange={setMode} />
        {mode === 'delivery' ? <ShipmentForm /> : <IngredientLevels />}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Segments options={modes} value={mode} onChange={setMode} />
        <View style={styles.search}>
          <Field label="Find" value={filter} onChangeText={setFilter} placeholder="Item, option or category" autoCorrect={false} />
        </View>
        <Text style={styles.summary}>{soldOut === 0 ? 'Everything is in stock' : `${soldOut} sold out`}</Text>
      </View>
      {error ? <Banner tone="danger" message={error} /> : null}

      <View style={styles.columns}>
        <StockList title="Menu items" rows={items} saving={saving} onToggle={(row, value) => void toggle('items', row, value)} />
        <StockList title="Options" rows={modifiers} saving={saving} onToggle={(row, value) => void toggle('modifiers', row, value)} />
      </View>
    </View>
  );
}

function StockList({
  title,
  rows,
  saving,
  onToggle,
}: {
  title: string;
  rows: StockRow[];
  saving: string | null;
  onToggle: (row: StockRow, isInStock: boolean) => void;
}) {
  return (
    <View style={styles.list}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView contentContainerStyle={styles.rows}>
        {rows.map((row, index) => {
          const header = index === 0 || rows[index - 1].group !== row.group ? row.group : null;
          return (
            <View key={row.id}>
              {header ? <Text style={styles.group}>{header}</Text> : null}
              <View style={[styles.row, !row.isInStock && styles.rowSoldOut]}>
                <Text style={[styles.name, !row.isInStock && styles.nameSoldOut]}>{row.name}</Text>
                <Text style={[styles.state, { color: row.isInStock ? colors.success : colors.danger }]}>
                  {row.isInStock ? 'In stock' : 'Sold out'}
                </Text>
                <Switch
                  value={row.isInStock}
                  disabled={saving === row.id}
                  onValueChange={(value) => onToggle(row, value)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  accessibilityLabel={`${row.name} in stock`}
                />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.md },
  toolbar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  search: { width: 360 },
  summary: { fontSize: font.large, fontWeight: '600', color: colors.textMuted, paddingBottom: space.md },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text, marginBottom: space.sm },
  rows: { paddingBottom: space.lg },
  group: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: space.md, marginBottom: space.xs, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowSoldOut: { backgroundColor: colors.dangerSoft },
  name: { flex: 1, fontSize: font.body, color: colors.text },
  nameSoldOut: { color: colors.danger },
  state: { fontSize: font.small, fontWeight: '700' },
});
