# ManSpy — Product Requirements Document

**Version:** 0.1  
**Status:** Draft  
**Author:** Olayiwola Aroyeun  
**Hackathon:** Mantle Turing Test Hackathon 2026 — AI Alpha & Data Track  
**Submission Deadline:** June 16, 2026  
**Date:** May 2026

---

## 1. Problem Statement

On-chain activity on Mantle moves fast. Whale wallets execute large transfers, smart money rotates positions, and anomalies appear and disappear within minutes. Retail traders and developers tracking these signals either miss them entirely or spend hours manually checking block explorers.

There is no accessible, real-time, AI-powered alert system specifically built for Mantle that brings these signals directly to where crypto-native users already are — Telegram.

ManSpy is a Telegram bot that monitors Mantle's chain in real time, detects whale movements and on-chain anomalies using an AI agent, and delivers plain-English alerts to users who care about specific wallets or unusual activity.

---

## 2. The Human vs. AI Angle

Mantle's hackathon theme is "Human vs. AI." ManSpy frames this directly:

**Humans watch dashboards. AI watches the chain.**

The bot positions itself as the AI co-pilot for on-chain intelligence. The human sets the rules — which wallets to watch, what thresholds matter, what they care about. The AI does the continuous monitoring, pattern recognition, and plain-English explanation of what it found and why it matters. The human makes the final decision. The AI never trades on their behalf — it only informs.

This framing maps cleanly onto the AI Alpha & Data track's stated goals: "smart money tracking and on-chain anomaly detection bots."

---

## 3. Target Users

**Primary:** Crypto traders and DeFi participants active on Mantle who want real-time intelligence without building their own monitoring infrastructure.

**Secondary:** Developers and researchers tracking specific protocols, funds, or wallets on Mantle for due diligence or competitive intelligence.

---

## 4. Goals

### Hackathon Goals
- Ship a working, demonstrable MVP by June 16
- Cover the core loop: monitor → detect → alert → explain
- Show the Human vs. AI mechanic clearly in the demo
- Win or place in the AI Alpha & Data track

### Product Goals
- Users receive actionable alerts within 60 seconds of an on-chain event
- AI explanations are clear enough for non-technical users to act on
- Users can self-serve wallet registration without needing to read documentation

---

## 5. Success Metrics (Hackathon Demo)

| Metric | Target |
|---|---|
| End-to-end latency (event → Telegram alert) | < 60 seconds |
| Tracked wallet alert accuracy | No false negatives on transactions > threshold |
| Anomaly detection true positive rate | ≥ 70% on demo scenarios |
| Demo flow completeness | All 4 core commands working live |

---

## 6. Core Concepts

**Whale Wallet** — a wallet holding or moving large amounts of MNT or tokens on Mantle. Threshold configurable, default $50,000 USD equivalent.

**Smart Money Wallet** — a user-registered wallet the bot tracks regardless of size. Could be a known VC wallet, a protocol treasury, a competitor, or the user's own wallet.

**Anomaly** — unusual on-chain behavior detected by the AI agent: sudden large transfers, rapid token accumulation, contract interactions from dormant wallets, unusual gas patterns, or volume spikes on specific tokens.

**Alert** — a Telegram message sent to a user containing: what happened, which wallet, how much, why the AI flagged it, and a link to the transaction on the Mantle explorer.

---

## 7. Features

### MVP Features

#### 7.1 Telegram Bot Commands

```
/start          — welcome message, onboarding flow
/watch <address> <label> — register a wallet to track
/unwatch <address>       — stop tracking a wallet
/list           — show all tracked wallets
/alerts on|off  — toggle all alerts
/threshold <usd_amount>  — set minimum USD value to alert on (default $50,000)
/status         — show bot status and your current settings
/help           — command reference
```

#### 7.2 Whale Detection
- Monitor all Mantle transactions in real time via Mantle RPC (WebSocket subscription)
- Flag any transaction above the user's configured USD threshold
- Alert includes: sender, receiver, amount, token, USD value at time of transaction, transaction hash, explorer link

#### 7.3 Anomaly Detection (AI Agent)
- AI agent analyzes flagged transactions and on-chain patterns
- Detects:
  - **Dormant wallet activation** — wallet inactive for >30 days suddenly moves funds
  - **Rapid accumulation** — wallet acquires >X% of a token's supply in <24 hours
  - **Large contract interaction** — significant value moved into/out of a DeFi protocol
  - **Unusual gas** — transaction gas far above or below recent network average
  - **Volume spike** — token transfer volume 3x above 7-day average
- AI generates a plain-English explanation of why each anomaly was flagged and what it might mean

#### 7.4 User-Registered Wallet Tracking
- Users register any public Mantle address with a custom label
- Bot monitors ALL transactions from registered wallets regardless of size
- Alerts include the user's label for that wallet ("Your label: Binance Hot Wallet just moved...")

#### 7.5 Alert Format
Each alert is a structured Telegram message:

```
🐋 WHALE ALERT — Mantle

From: 0x1234...5678
To:   0xabcd...ef01
Amount: 2,400,000 MNT (~$840,000)

🤖 AI Analysis:
This wallet has been dormant for 47 days and just moved 
a significant portion of its holdings to a known DEX 
aggregator. Pattern matches pre-swap accumulation behavior.

🔗 View on Explorer: mantlescan.xyz/tx/0x...
⏱ Detected: 14 seconds ago
```

### Post-MVP Features (Planned)
- Discord bot support
- Portfolio tracking (track your own wallet's P&L)
- Weekly AI-generated summary reports
- Token-specific monitoring (alert only on transfers of a specific token)
- Multi-chain expansion (Ethereum, Arbitrum)
- Web dashboard for managing alerts and viewing history
- Bybit price data integration for USD value accuracy

---

## 8. Technical Architecture

### Overview
```
Mantle RPC (WebSocket)
        ↓
Transaction Ingestion Service (NestJS)
        ↓
Event Queue (BullMQ + Redis)
        ↓
Detection Pipeline
    ├── Threshold Filter (whale detection)
    ├── Wallet Tracker (user-registered wallets)
    └── Anomaly Detector (AI Agent — Claude API)
        ↓
Alert Service
        ↓
Telegram Bot (Telegraf)
        ↓
User
```

### Stack
- **Backend:** NestJS, TypeScript
- **Telegram Bot:** Telegraf (Node.js Telegram Bot framework)
- **Blockchain:** Mantle RPC via `ethers.js` or `viem` (WebSocket provider for real-time events)
- **AI:** Claude API for anomaly analysis and plain-English explanations
- **Queue:** BullMQ + Redis
- **Database:** PostgreSQL (via Prisma) — users, tracked wallets, alert history
- **Price Data:** Bybit API or CoinGecko API for USD conversion
- **Deployment:** Railway or Render (fast, cheap, good for NestJS)

### Key Services (NestJS Modules)

**IngestionModule**
- `MantleListenerService` — maintains WebSocket connection to Mantle RPC, subscribes to pending and confirmed transactions
- `TransactionNormalizerService` — normalizes raw transaction data into a consistent internal format

**DetectionModule**
- `ThresholdDetectionService` — filters transactions above user-configured USD threshold
- `WalletTrackerService` — matches transactions against user-registered wallet addresses
- `AnomalyDetectionService` — sends flagged transactions to Claude API for pattern analysis and explanation generation

**AlertModule**
- `AlertFormatterService` — formats detection results into Telegram message templates
- `TelegramDeliveryService` — sends formatted alerts to the correct Telegram chat IDs

**BotModule**
- `TelegrafService` — handles all incoming Telegram commands
- `UserService` — manages user registration, settings, and tracked wallets

**PriceModule**
- `PriceService` — fetches real-time token prices from Bybit API for USD conversion, with Redis caching (60-second TTL)

### Data Models

```
User
  id, telegramChatId, alertsEnabled, thresholdUsd, createdAt

TrackedWallet
  id, userId, address, label, createdAt

AlertLog
  id, userId, txHash, type (whale|anomaly|tracked), message, sentAt
```

---

## 9. Detection Pipeline (Detailed)

```
1. MantleListenerService receives confirmed transaction from WebSocket
2. TransactionNormalizerService extracts: from, to, value, token, gas, timestamp
3. PriceService converts value to USD
4. Three parallel checks:
   a. ThresholdDetectionService — is USD value > any user's threshold?
   b. WalletTrackerService — is from/to address in any user's tracked list?
   c. Queue transaction for anomaly batch analysis (every 30 seconds)
5. If (a) or (b) triggers:
   - Send transaction to AnomalyDetectionService (Claude API)
   - Claude analyzes: wallet history, transaction pattern, context
   - Returns: anomaly_detected (bool), explanation (string), confidence (0-1)
6. AlertFormatterService builds Telegram message
7. TelegramDeliveryService sends to all matching users
8. AlertLog records sent alert
```

---

## 10. AI Agent Prompt Design

The Claude API call for anomaly analysis receives:

**System prompt:**
```
You are an on-chain intelligence analyst specializing in Mantle blockchain activity. 
You analyze transactions and wallet behavior to identify patterns that may be 
significant to traders and DeFi participants. Be concise, factual, and actionable.
Never make buy/sell recommendations. Focus on describing what happened and 
what pattern it matches, not what the user should do.
```

**User prompt (constructed dynamically):**
```
Analyze this Mantle transaction for anomalies:

Transaction: {txHash}
From: {fromAddress} (last active: {lastActiveDate}, total txs: {txCount})
To: {toAddress} (contract: {isContract}, protocol: {protocolName if known})
Value: {amount} {token} (~${usdValue})
Gas: {gasUsed} (network average: {networkAvgGas})

Recent activity from this wallet (last 7 days):
{recentTxSummary}

Is this transaction anomalous? If yes, explain why in 2-3 sentences in plain English. 
If no, say "No anomaly detected."

Respond in JSON: { "anomaly": true|false, "explanation": "...", "confidence": 0.0-1.0 }
```

---

## 11. Mantle-Specific Considerations

- **Mantle RPC endpoint:** `wss://rpc.mantle.xyz` (WebSocket for real-time)
- **Explorer:** mantlescan.xyz for transaction links in alerts
- **Native token:** MNT — price feed needed for USD conversion
- **EVM-compatible:** standard ethers.js/viem patterns work without modification
- **Gas costs:** Mantle has low gas fees, so high transaction volume is expected — the threshold filter is critical to avoid alert spam

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Mantle RPC WebSocket drops connection | Auto-reconnect with exponential backoff; alert if downtime > 60 seconds |
| Alert spam overwhelming users | Per-user rate limiting (max 10 alerts/hour by default); user-configurable threshold |
| Claude API latency slows alert delivery | Run anomaly analysis async; send basic alert immediately, append AI analysis when ready |
| Bybit API rate limits | Cache prices in Redis with 60-second TTL; fallback to CoinGecko |
| False positives annoy users | Show confidence score in alert; add /feedback command for users to flag bad alerts |
| Solo build — scope creep | Hard cutoff: MVP is the 4 commands + whale + tracked wallet alerts. Anomaly detection is stretch goal |

---

## 13. Milestone Plan (4 Weeks to June 16)

### Week 1 — Infrastructure
- NestJS project scaffold
- PostgreSQL + Prisma schema
- Redis + BullMQ setup
- Telegraf bot with /start, /help, /status commands
- Mantle WebSocket connection + transaction ingestion

### Week 2 — Core Detection
- Threshold detection (whale alerts)
- User-registered wallet tracking
- Price service (Bybit API + Redis cache)
- Basic alert formatting and Telegram delivery
- /watch, /unwatch, /list, /threshold commands

### Week 3 — AI Layer
- Claude API integration for anomaly analysis
- Wallet history fetching (Mantle RPC — transaction count, last active)
- Anomaly detection pipeline
- Alert format with AI explanation
- /alerts on|off command

### Week 4 — Polish + Submission
- End-to-end testing with real Mantle transactions
- Rate limiting and anti-spam
- Error handling and reconnection logic
- Demo script preparation
- Hackathon submission writeup
- Deploy to Railway

---

## 14. Demo Script (Hackathon Submission)

The demo needs to show the Human vs. AI mechanic clearly:

1. Open Telegram, start the bot with `/start`
2. Register a known whale wallet with `/watch 0x... Mantle Whale`
3. Show `/list` confirming it's tracked
4. Trigger a test transaction on Mantle devnet from that wallet
5. Bot sends alert within 60 seconds — show the whale detection firing
6. Show the AI analysis explaining why it was flagged
7. Demonstrate `/threshold 10000` lowering the threshold
8. Show another alert firing at the new threshold
9. Close with: "The human sets the rules. The AI watches the chain."

---

## 15. Competitive Landscape

| Tool | What it does | Gap |
|---|---|---|
| Nansen | Smart money tracking, multi-chain | Expensive, no Telegram alerts, no Mantle support |
| Arkham Intelligence | Wallet intelligence | No real-time Telegram alerts, no Mantle |
| Whale Alert | Cross-chain whale alerts | No AI analysis, no custom wallet tracking, no Mantle |
| DeBank | Portfolio tracking | Not alert-focused, no AI layer |

ManSpy's advantage for this hackathon: it's the only tool built specifically for Mantle with an AI explanation layer and Telegram-native delivery.
