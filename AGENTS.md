# AGENTS.md — manspy

This repository implements **ManSpy**, a Telegram bot that monitors Mantle Network in real time for whale movements and on-chain anomalies using an AI agent. See the full PRD at `docs/manspy-prd.md`.

## Key Reference

- **`docs/manspy-prd.md`** — full architecture, stack, data models, prompt design, milestone plan.
- **`tasks.md`** — remaining todo items before hackathon submission (June 16, 2026). Check this file at the start of every session.

## Commands

| Action | Command |
|---|---|
| Start infra (postgres + redis) | `docker compose up -d` |
| Dev server (hot reload) | `npm run start:dev` |
| Build | `npm run build` |
| Prisma migration | `npx prisma migrate dev --name <name>` |
| Prisma generate | `npx prisma generate` |
| Prisma Studio | `npx prisma studio` |

## Architecture

```
Mantle RPC (WebSocket) → IngestionModule → DetectionModule → AlertModule → TelegrafService → User
                                ↑                        ↓
                           PriceModule           BullMQ (Week 2)
```

**Modules:** AppModule → ConfigModule, PrismaModule, BotModule, IngestionModule, PriceModule

## Known Quirks

- **Telegraf `launch()`** calls `api.telegram.org` and will fail if outbound HTTPS is blocked in the dev environment. Works fine on deploy.
- **Prisma 6** — we pinned to v6. Do not upgrade to v7 without updating the datasource config pattern (`prisma.config.ts` + driver adapters).
- **Redis price cache** uses `SET key value EX ttl` (not `SETEX`).
- **Mantle RPC WS** falls back to HTTP if WebSocket drops.

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS 11, TypeScript 5 |
| Telegram Bot | Telegraf 4 |
| Blockchain | viem, Mantle RPC (WebSocket) |
| AI | Claude API (Week 3) |
| Queue | BullMQ + Redis (Week 2) |
| DB | PostgreSQL 16 + Prisma 6 |
| Price | Bybit API + CoinGecko fallback |
| Deploy | Railway or Render |

## Milestones

| Week | Focus | Status |
|---|---|---|
| 1 | NestJS scaffold, DB schema, Docker, Telegraf, Mantle WS, PriceService | ✅ Done |
| 2 | Whale detection, wallet tracking, alert delivery | ✅ Done |
| 3 | Gemini API, anomaly detection pipeline, address labels, batching | ✅ Done |
| 4 | E2E testing, rate limiting, error handling, deploy, demo script | ✅ Done |

**Remaining:** Record demo video, submit hackathon entry, Nansen integration (if credits arrive)

Deadline: **June 16, 2026**
