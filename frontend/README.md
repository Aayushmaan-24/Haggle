# Haggle — frontend

The web client for Haggle. Next.js App Router, TypeScript, Tailwind CSS v4, built as a
**static export** that the FastAPI backend serves from `frontend/out`.

> Phase 0 status: foundation only. The theme, shell, routing and typed API client exist.
> The Trading Floor, deal/payment flow and other screens are placeholders.

## Requirements

- Node.js 20+ (built with 24)
- The backend running on `http://localhost:8000`

## Development

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

In development the API base defaults to `http://localhost:8000`. The backend's CORS
allow-list only includes `http://localhost:3000`, so **run the dev server on port 3000**
(or add your origin to `FRONTEND_URL`).

Start the backend from the repository root:

```bash
cd backend
uvicorn app:app --reload --port 8000
```

## Build and serve through FastAPI

```bash
cd frontend
npm run build        # writes frontend/out
```

Then start (or restart) uvicorn. `backend/app.py` mounts `frontend/out` at `/` only if the
directory exists when the app is imported, so build **before** starting the server:

```bash
cd backend
uvicorn app:app --port 8000   # serves the app at http://localhost:8000/
```

The export uses `trailingSlash: true`, so Starlette's `StaticFiles(html=True)` resolves
`/trading-floor/` to `trading-floor/index.html`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `""` (same origin) in production, `http://localhost:8000` in development | API origin for every request |

`NEXT_PUBLIC_*` values are inlined at build time — rebuild after changing them. Never put
backend secrets in a `NEXT_PUBLIC_` variable; the PayPal client secret and Gemini key stay
on the server.

## Routes

| Route | Screen |
|---|---|
| `/` | Overview |
| `/trading-floor/` | Live negotiation table |
| `/policy/` | Seller policy compiler |
| `/benchmark/` | Benchmark snapshot |
| `/receipt/?deal=<id>` | Deal details, payment and delivery (PayPal return target) |

Deal identity travels in the query string because the backend redirects to
`{FRONTEND_URL}/receipt?deal=…`; there are no dynamic path segments.

## Structure

```
app/                 routes, root layout, global tokens
components/shell/    sidebar, top bar, mobile tabs, page header
components/ui/       buttons, cards, placeholder
lib/                 API client, payload types, nav model, helpers
```

Payload types in `lib/types.ts` mirror `backend/app.py` and `backend/market.py`. If an
endpoint changes, update the type and the API helper together.
