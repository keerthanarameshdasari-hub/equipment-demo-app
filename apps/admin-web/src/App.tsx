import { useEffect, useState } from 'react';
import { ApiClientError, type ApiClient, type Equipment } from '@equipdemo/contracts';
import { EquipmentTable } from './EquipmentTable';

type State = { status: 'loading' } | { status: 'ready'; items: Equipment[] } | { status: 'error'; message: string };

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.kind === 'http' ? `${error.message}${error.requestId ? ` (request ${error.requestId})` : ''}` : error.message;
  }
  return 'Something went wrong.';
}

export function App({ client, initialState }: { client: ApiClient; initialState?: State }) {
  const [state, setState] = useState<State>(initialState ?? { status: 'loading' });

  useEffect(() => {
    if (initialState) {
      return;
    }
    let active = true;
    client
      .listEquipment()
      .then(items => active && setState({ status: 'ready', items }))
      .catch(error => active && setState({ status: 'error', message: errorMessage(error) }));
    return () => {
      active = false;
    };
  }, [client, initialState]);

  return (
    <main>
      <h1>equipDemo admin</h1>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && <EquipmentTable items={state.items} />}
    </main>
  );
}
