# Tsukamoto Web (Next.js)

A minimal Next.js app to list public OTC orders from the local orderflow service and provide a Fill button (wired to local flow next).

## Dev

- From repo root: `bun install`
- Then:

```bash
cd apps/web
bun install
export NEXT_PUBLIC_OTC_API_URL=http://localhost:3000
bun run dev
```

Open http://localhost:5173
