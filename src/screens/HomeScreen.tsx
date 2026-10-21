import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  describeCount,
  filterEquipment,
  formatPricePerHour,
  type Equipment,
} from '../domain/equipment';
import { toUserMessage } from '../data/DataError';
import { DATA_SOURCE_LABELS } from '../data/EquipmentRepository';
import { useEquipmentRepository } from '../data/RepositoryContext';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation, route }: Props) {
  const repository = useEquipmentRepository();
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Version 2: client-side search over the loaded list.
  const [query, setQuery] = useState('');

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        setItems(await repository.list());
      } catch (e) {
        // Keep any list already shown; the error appears above it.
        setError(toUserMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repository],
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  // After a successful submit, AddEquipment returns here with `created`.
  const created = route.params?.created;
  useEffect(() => {
    if (created) {
      setNotice(`Added “${created.name}”.`);
      load('refresh');
    }
  }, [created, load]);

  const refresh = () => {
    setNotice(null);
    load('refresh');
  };

  const visibleItems = filterEquipment(items ?? [], query);

  const header = (
    <View style={styles.header}>
      <Text style={styles.appName} accessibilityRole="header">
        equipDemo
      </Text>
      <Text style={styles.tagline}>Equipment available for hire</Text>
      <Text
        testID="data-source"
        style={[styles.badge, repository.source === 'mock' ? styles.badgeDemo : styles.badgeLive]}
      >
        {DATA_SOURCE_LABELS[repository.source]}
      </Text>
      <View style={styles.actions}>
        <Pressable
          testID="refresh-button"
          accessibilityRole="button"
          accessibilityLabel="Refresh list"
          style={[styles.button, styles.buttonSecondary]}
          onPress={refresh}
          disabled={loading || refreshing}
        >
          <Text style={styles.buttonSecondaryText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
        <Pressable
          testID="add-button"
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setNotice(null);
            navigation.navigate('AddEquipment');
          }}
        >
          <Text style={styles.buttonText}>+ Add equipment</Text>
        </Pressable>
      </View>
      {notice ? (
        <Text testID="success-message" style={[styles.banner, styles.bannerSuccess]}>
          {notice}
        </Text>
      ) : null}
      {error && items ? (
        <Text testID="error-message" style={[styles.banner, styles.bannerError]}>
          {error}
        </Text>
      ) : null}
      {items && items.length > 0 ? (
        <View style={styles.searchRow}>
          <TextInput
            testID="search-input"
            accessibilityLabel="Search equipment"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search equipment"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              testID="clear-search"
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {items && items.length > 0 ? (
        <Text testID="result-count" style={styles.count}>
          {describeCount(visibleItems.length, items.length)}
        </Text>
      ) : null}
    </View>
  );

  // First load: nothing to show yet.
  if (loading && !items) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center} testID="loading">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.muted}>Loading equipment…</Text>
        </View>
      </View>
    );
  }

  // First load failed: full error state with retry.
  if (error && !items) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <Text testID="error-message" style={[styles.banner, styles.bannerError]}>
            {error}
          </Text>
          <Pressable
            testID="retry-button"
            accessibilityRole="button"
            style={styles.button}
            onPress={() => load('initial')}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={visibleItems}
      keyExtractor={item => String(item.id)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        items && items.length > 0 ? (
          <Text testID="no-match-message" style={[styles.muted, styles.empty]}>
            No equipment matches “{query.trim()}”.
          </Text>
        ) : (
          <Text testID="empty-message" style={[styles.muted, styles.empty]}>
            No equipment yet. Add the first one.
          </Text>
        )
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      renderItem={({ item }) => (
        <Pressable
          testID={`equipment-${item.id}`}
          accessibilityRole="button"
          style={styles.card}
          onPress={() => navigation.navigate('Details', { equipment: item })}
        >
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.price}>{formatPricePerHour(item.price_per_hour)}</Text>
          <Text style={styles.link}>View details →</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 20 },
  header: { marginBottom: 12, gap: 8 },
  appName: { fontSize: 30, fontWeight: 'bold', color: colors.primary },
  tagline: { fontSize: 16, color: colors.muted },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: 'hidden',
  },
  badgeLive: { backgroundColor: colors.successBg, color: colors.successText },
  badgeDemo: { backgroundColor: colors.warnBg, color: colors.warnText },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  muted: { color: colors.muted, fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 32 },
  banner: { padding: 12, borderRadius: 8, fontSize: 15 },
  bannerSuccess: { backgroundColor: colors.successBg, color: colors.successText },
  bannerError: { backgroundColor: colors.errorBg, color: colors.errorText },
  card: {
    backgroundColor: colors.surface,
    padding: 18,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: colors.text },
  price: { fontSize: 16, color: colors.price, marginBottom: 8 },
  link: { color: colors.primary, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: { paddingHorizontal: 8, paddingVertical: 10 },
  clearText: { color: colors.primary, fontWeight: '600' },
  count: { color: colors.muted, fontSize: 14 },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: colors.onPrimary, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonSecondaryText: { color: colors.primary, fontWeight: '600' },
});
