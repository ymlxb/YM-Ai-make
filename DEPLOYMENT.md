# Deployment Checklist

This project has two deployable services:

- `frontend`: Next.js app on port `3000`
- `server`: Express API on port `7001`

## Required Environment

Copy `server/.env.example` to `server/.env` and fill the production keys:

- `MAIN_MODEL_PROVIDER`
- model provider API key and model values
- `QWEN_API_KEY` for vision input
- `ALI_OSS_*` values for uploads
- `CORS_ORIGIN`, set to the public frontend origin

Copy `frontend/.env.example` to `frontend/.env.local` for local work. In production, set:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com
```

## Local Production Smoke Test

```bash
docker compose up --build
```

Then check:

- frontend: http://localhost:3000
- server health: http://localhost:7001/health

## Preflight Before Going Live

```bash
cd server
npx tsc --noEmit

cd ../frontend
npm run build
```

## Production Notes

- Do not commit real `.env` files.
- Put the server behind HTTPS before public launch.
- Keep `CORS_ORIGIN` strict in production instead of using `*`.
- `NEXT_PUBLIC_API_BASE_URL` is baked into the frontend build, so rebuild the frontend when changing the API domain.
