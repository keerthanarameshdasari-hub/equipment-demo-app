import type { Equipment } from '../domain/equipment';

export type RootStackParamList = {
  /** `created` is set after a successful submit so Home can confirm and refresh. */
  Home: { created?: { id: number; name: string } } | undefined;
  AddEquipment: undefined;
  Details: { equipment: Equipment };
};
