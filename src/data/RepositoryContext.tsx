import React, { createContext, useContext, type ReactNode } from 'react';
import type { EquipmentRepository } from './EquipmentRepository';

const RepositoryContext = createContext<EquipmentRepository | null>(null);

/** Supplies the data source to screens; tests pass a mock here. */
export function RepositoryProvider({
  repository,
  children,
}: {
  repository: EquipmentRepository;
  children: ReactNode;
}) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useEquipmentRepository(): EquipmentRepository {
  const repository = useContext(RepositoryContext);
  if (!repository) {
    throw new Error('useEquipmentRepository must be used inside RepositoryProvider');
  }
  return repository;
}
