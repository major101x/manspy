# Nansen Integration Plan — ManSpy

**Status:** Deferred to post-hackathon / future premium feature  
**Reason:** Free plan costs 10x credits (640 credits = ~10 alerts with enrichment). Not viable for hackathon MVP.  
**Filed:** May 26, 2026

---

## Why Deferred

| Endpoint | Base Cost | Free Plan Multiplier | Effective Cost | Calls from 640 Credits |
|---|---|---|---|---|
| `/profiler/address/labels` (Common) | 100 | ×10 | 1,000 | **0** |
| `/profiler/address/labels` (Premium) | 500 | ×10 | 5,000 | **0** |
| `/profiler/address/current-balance` | 1 | ×10 | 10 | **64** |
| `/profiler/address/pnl-summary` | 1 | ×10 | 10 | **64** |
| `/profiler/address/transactions` | 1 | ×10 | 10 | **64** |

Even using only the cheap profiler endpoints, a single alert touching 2 addresses with 3 lookups each burns **60 credits**. With 640 total, that's ~10 enriched alerts before running out.

**Verdict:** Not enough runway for a hackathon demo. Implement later as a premium Pro/Enterprise feature.

---

## Future Architecture

### New Module: `src/nansen/`

| File | Purpose |
|---|---|
| `nansen.module.ts` | NestJS module, exports `NansenService` |
| `nansen.service.ts` | HTTP client for Nansen API, caching, error handling |
| `nansen.types.ts` | TypeScript interfaces for profiler responses |
| `nansen.guard.ts` | Feature flag / tier check (Pro/Enterprise gating) |

### Integration Points

- `AnomalyService` calls `NansenService.enrichAlert(from, to)` before sending to Gemini
- If Nansen returns data → append to Gemini prompt as context
- If Nansen fails (timeout, rate limit, out of credits) → log warning, continue with standard AI analysis

### Which Endpoints to Call (Cheap Ones Only)

For each address in an alert (`from` + `to`), call these in parallel:

| Endpoint | Effective Cost | What We Get |
|---|---|---|
| `/profiler/address/current-balance` | 10 credits | Token holdings + USD value |
| `/profiler/address/pnl-summary` | 10 credits | Realized PnL, win rate, trade summary |
| `/profiler/address/transactions` | 10 credits | Activity level (fresh vs. established) |

**Per alert:** 2 addresses × 3 endpoints = **60 credits**

### Caching Strategy (Critical)

Without caching, credits burn fast. With caching, they last indefinitely.

```
Redis key: nansen:address:{lowerCaseAddress}
TTL: 7 days
Value: { currentBalance, pnlSummary, transactions, cachedAt }
```

- First time seeing an address → call Nansen → cache result
- Repeat address within 7 days → serve from cache, **0 credits burned**
- Cache miss + Nansen fails → return empty enrichment, standard AI continues

### Error Handling (Bulletproof)

```typescript
try {
  const enrichment = await this.nansenService.enrichAddress(address);
  // append to Gemini prompt
} catch (error) {
  this.logger.warn(`Nansen enrichment failed for ${address}: ${error.message}`);
  // continue without enrichment — standard AI analysis still runs
}
```

**Failure modes handled:**
- Nansen returns 429 (rate limit) → skip, cache empty for 1h
- Nansen returns 402 (out of credits) → skip, disable Nansen for 24h
- Request timeout (5s) → skip, don't block alert pipeline
- Network error → skip, log warning

### Gemini Prompt Update

Current prompt gets:
```
Transaction: 11,517 MNT ($7,409) from 0x0000... to 0x88a8...
```

With Nansen enrichment:
```
Transaction: 11,517 MNT ($7,409) from 0x0000... to 0x88a8...

Nansen context for 0x0000...:
- Holdings: $12.3M USDC, $4.1M WETH
- PnL: 340% realized, top 5 trades all profitable
- Activity: 1,247 transactions over 18 months

Nansen context for 0x88a8...:
- Holdings: $0.02 (fresh wallet, 3 transactions total)
- PnL: N/A
- Activity: Created 2 days ago
```

Gemini produces **significantly better analysis** with this context.

### Future-Proofing for Premium Tiers

Add a simple feature flag:

```typescript
// In AnomalyService
const useNansen = user.tier !== 'free' || this.config.get('NANSEN_FREE_ENABLED') === 'true';
```

For launch: set `NANSEN_FREE_ENABLED=true` for judges.
For production: remove env var → only Pro/Enterprise users get enrichment.

### Files to Create/Modify

| File | Action |
|---|---|
| `src/nansen/nansen.module.ts` | Create |
| `src/nansen/nansen.service.ts` | Create |
| `src/nansen/nansen.types.ts` | Create |
| `src/anomaly/anomaly.module.ts` | Add `NansenModule` to imports |
| `src/anomaly/anomaly.service.ts` | Inject `NansenService`, enrich before Gemini call |
| `src/config/env.validation.ts` | Add `NANSEN_API_KEY` validation |
| `.env` | Add `NANSEN_API_KEY` |
| `README.md` | Document Nansen integration |

---

## Nansen API Reference (Snapshot May 2026)

**Base URL:** `https://api.nansen.ai/api/v1`
**Auth:** Header `X-API-Key: <your_key>`
**Docs:** `https://docs.nansen.ai`

### Relevant Endpoints

| Endpoint | Path | Base Cost | Description |
|---|---|---|---|
| Address Labels (Common) | `/profiler/address/labels` | 100 | CEX, DeFi, ENS, behavioral tags |
| Address Labels (Premium) | `/profiler/address/premium-labels` | 500 | Above + Smart Money, Alpha Trader, Public Figure |
| Current Balance | `/profiler/address/current-balance` | 1 | Token holdings + USD value |
| Historical Balances | `/profiler/address/historical-balances` | 1 | Historical snapshots |
| Transactions | `/profiler/address/transactions` | 1 | Recent transaction list |
| PnL Summary | `/profiler/address/pnl-summary` | 1 | Trade summary + top 5 trades |
| PnL | `/profiler/address/pnl` | 1 | List of past trades + performance |
| Related Wallets | `/profiler/address/related-wallets` | 1 | First-degree related wallets |
| Counterparties | `/profiler/address/counterparties` | 5 | Top counterparties |

### Smart Money Endpoints (Aggregate, Not Per-Address)

| Endpoint | Path | Base Cost | Description |
|---|---|---|---|
| Net Flows | `/smart-money/netflow` | 5 | Net inflow/outflow by token |
| Holdings | `/smart-money/holdings` | 5 | Token holdings of Smart Money |
| DEX Trades | `/smart-money/dex-trades` | 5 | Recent DEX trades |

### Smart Money Labels

| Label | Description |
|---|---|
| `Fund` | Institutional investment funds |
| `Smart Trader` | Historically profitable traders |
| `30D Smart Trader` | Top performers (30-day window) |
| `90D Smart Trader` | Top performers (90-day window) |
| `180D Smart Trader` | Top performers (180-day window) |
| `Smart HL Perps Trader` | Profitable Hyperliquid traders |
| `Public Figure` | Known public figures |
| `Exchange` | CEX hot/cold wallets |
| `Whale` | High-balance wallets |

---

## Business Model Placement

| Tier | Nansen Feature |
|---|---|
| **Free** | Hardcoded labels only (Bybit, tokens, DEXs) — no Nansen |
| **Pro ($12/mo)** | Nansen wallet profiling: current balance, PnL summary, transaction activity |
| **Enterprise ($99/mo)** | Full Nansen labels (premium endpoint access), Smart Money signals, aggregate flows, API access |

---

## When to Revisit

- **Credits increase** (if Nansen adjusts free plan pricing)
- **Revenue milestone** (first 50 Pro subscribers = fund paid Nansen plan)
- **Hackathon follow-up** (if judges specifically ask for Nansen integration)
- **Multi-chain expansion** (Nansen supports Ethereum, Solana, etc. — useful for cross-chain analysis)

---

## Contact

- **Nansen API Docs:** https://docs.nansen.ai
- **API Key Management:** https://nansen.ai (dashboard)
- **Support:** API support via Nansen Discord
