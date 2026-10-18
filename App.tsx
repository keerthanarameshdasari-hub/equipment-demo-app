import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDefaultRepository, type EquipmentRepository } from './src/data';
import { RepositoryProvider } from './src/data/RepositoryContext';
import type { RootStackParamList } from './src/navigation/types';
import { AddEquipmentScreen } from './src/screens/AddEquipmentScreen';
import { DetailsScreen } from './src/screens/DetailsScreen';
import { HomeScreen } from './src/screens/HomeScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

type Props = {
  /** Injectable for tests; defaults to Supabase when configured, else demo data. */
  repository?: EquipmentRepository;
};

export default function App({ repository }: Props) {
  const [repo] = useState(() => repository ?? createDefaultRepository());

  return (
    <RepositoryProvider repository={repo}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'equipDemo' }} />
          <Stack.Screen
            name="AddEquipment"
            component={AddEquipmentScreen}
            options={{ title: 'Add equipment' }}
          />
          <Stack.Screen name="Details" component={DetailsScreen} options={{ title: 'Details' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </RepositoryProvider>
  );
}
