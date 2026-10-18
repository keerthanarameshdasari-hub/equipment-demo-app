import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatPricePerHour } from '../domain/equipment';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Details'>;

export function DetailsScreen({ route }: Props) {
  const { equipment } = route.params;

  return (
    <View style={styles.center}>
      <Text style={styles.heading}>Equipment details</Text>
      <Text style={styles.name}>{equipment.name}</Text>
      <Text style={styles.price}>{formatPricePerHour(equipment.price_per_hour)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: { fontSize: 24, fontWeight: 'bold', color: colors.primary, marginBottom: 8 },
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  price: { fontSize: 18, color: colors.price },
});
