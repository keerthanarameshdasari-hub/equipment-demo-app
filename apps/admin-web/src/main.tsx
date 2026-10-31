import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApiClient } from '@equipdemo/contracts';
import { App } from './App';
import { readAdminConfig } from './config';

const config = readAdminConfig(import.meta.env as unknown as Record<string, string | undefined>);
const client = createApiClient({ baseUrl: config.VITE_API_BASE_URL });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
