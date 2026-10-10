
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './lib/supabase';

type Equipment = {
  id: number;
  name: string;
  price_per_hour: number;
};

type RootStackParamList = {
  Home: undefined;
  Details: { equipment: Equipment };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: any) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadEquipment() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('equipment')
      .select('id, name, price_per_hour')
      .order('id');

    if (error) {
      setError('Could not load equipment. Please try again.');
      console.error('Supabase error:', error.message);
    } else {
      const validEquipment = (data ?? []).filter(
  (item) =>
    item.id != null &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    item.price_per_hour != null &&
    Number.isFinite(Number(item.price_per_hour)) &&
    Number(item.price_per_hour) >= 0
);

setEquipment(validEquipment);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadEquipment();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading equipment...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text>{error}</Text>
        <Pressable style={styles.button} onPress={loadEquipment}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Available Equipment</Text>

      <FlatList
        data={equipment}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text>No equipment available.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('Details', { equipment: item })}
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.price}>
              ₹{Number(item.price_per_hour).toLocaleString('en-IN')} / hour
            </Text>
            <Text style={styles.link}>View details →</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function DetailsScreen({ route }: any) {
  const { equipment } = route.params;

  return (
    <View style={styles.center}>
      <Text style={styles.heading}>Equipment Details</Text>
      <Text style={styles.name}>{equipment.name}</Text>
      <Text style={styles.price}>
        ₹{Number(equipment.price_per_hour).toLocaleString('en-IN')} / hour
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F6FF',
    padding: 20,
  },
  center: {
    flex: 1,
    backgroundColor: '#F2F6FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2457C5',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE5F5',
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    color: '#16803C',
    marginBottom: 8,
  },
  link: {
    color: '#2457C5',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#2457C5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
