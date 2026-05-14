# AGENTS.md — manspy

This repository implements **Mantle Watchdog**, a Telegram bot that monitors Mantle Network in real time for whale movements and on-chain anomalies using an AI agent. See the full PRD at `docs/mantle-watchdog-prd.md`.

## State

- No source code or config files exist yet (still in design phase).
- No build/test/lint tooling chosen.
- No CI or pre-commit hooks.
- No `.git` directory — VCS may not be initialized.

## Key Reference

- **`docs/mantle-watchdog-prd.md`** — the sole authoritative document. Read it before doing anything else. It contains the full architecture, stack decisions, data models, prompt design, and milestone plan.

## Stack (from PRD)

| Layer | Choice |
|---|---|
| Backend | NestJS, TypeScript |
| Telegram Bot | Telegraf |
| Blockchain | viem/ethers.js, Mantle RPC (WebSocket) |
| AI | Claude API |
| Queue | BullMQ + Redis |
| DB | PostgreSQL + Prisma |
| Price | Bybit API + CoinGecko fallback |
| Deploy | Railway or Render |

## Commands (from PRD)

- **Build:** not yet established
- **Test:** not yet established
- **Run dev:** not yet established
- **DB:** PostgreSQL + Prisma migrations
- **Queue:** Redis + BullMQ required locally or via Docker

## Milestones (PRD §13)

| Week | Focus |
|---|---|
| 1 | NestJS scaffold, DB schema, Redis, Telegraf basics, Mantle WebSocket ingestion |
| 2 | Whale detection, wallet tracking, price service, alert delivery |
| 3 | Claude API integration, anomaly detection pipeline |
| 4 | E2E testing, rate limiting, error handling, deploy, demo prep |

Deadline: **June 16, 2026** — Mantle Turing Test Hackathon.
