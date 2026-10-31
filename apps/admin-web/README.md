# admin-web

React 19 + Vite admin console. Reads `VITE_API_BASE_URL` (public, validated) and talks to the api only
through `createApiClient` from `@equipdemo/contracts`.

```bash
npm run dev -w @equipdemo/admin-web     # http://127.0.0.1:5173 (api must allow this origin: CORS_ORIGINS)
npm run build -w @equipdemo/admin-web   # static files in dist/
```

Everything prefixed `VITE_` is compiled into the public bundle: never put secrets there.
