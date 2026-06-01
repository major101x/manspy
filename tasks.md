# ManSpy — Remaining Tasks

**Deadline:** June 16, 2026  
**Current Status:** MVP complete, deployed, demo script written

---

## Critical (Must Do)

### 1. Record Demo Video
- [x] Test `/test/alert` endpoint on production (verified — fires instantly to chat)
- [x] Test AI analysis appends (verified — Gemini appends pattern + risk)
- [x] Verify smart contract on-chain logging (verified — tx `0x69bbeb...` on Mantle Sepolia)
- [ ] Record Scene 1-9 using demo script (`docs/demo-script.md`)
- [ ] Edit out 3-min wait between Scene 4 and 5
- [ ] Export at 1080p, 60fps
- [ ] Upload to YouTube / Loom / Google Drive

**Time:** 2-3 hours  
**Dependencies:** Production deploy with test endpoints enabled

### 2. Hackathon Submission Writeup
- [ ] Project description (500 words max)
- [ ] Technical architecture summary
- [ ] Link to demo video
- [ ] Link to live bot: @ManSpyAIBot
- [ ] Link to deployed service: https://manspy.onrender.com
- [ ] GitHub repo: https://github.com/major101x/manspy
- [ ] Team info (solo: Olayiwola Aroyeun)
- [ ] Screenshots of alerts + AI analysis

**Time:** 2-3 hours  
**Dependencies:** Demo video recorded

---

## High Priority (Should Do)

### 3. Architecture Diagram
- [ ] Draw simple diagram: Mantle WS → NestJS → Detection → Gemini → Telegram
- [ ] Export as PNG/SVG for slides
- [ ] Include in demo video (Scene 2)

**Time:** 30 min

### 4. Business Model Slide
- [ ] Create slide: Free / Pro ($9/mo) / Enterprise ($49/mo)
- [ ] Include Nansen integration mention
- [ ] Include in demo video (Scene 8)

**Time:** 30 min

---

## Bonus (If Time)

### 5. Quick Wins for Higher Score (Pre-Video)
- [x] Integrate Nansen profiler trio into `AddressLabelService` — **DONE**
  - Enriches unknown addresses with holdings, PnL, transaction count
  - Redis cache (7-day TTL) minimizes API calls
  - Fallback to standard AI analysis if Nansen fails
  - **Impact:** Bumps "Data source quality" from ~10/15 to ~14/15
- [ ] Add `/trends` command — top moving wallets in last 24h (investment utility)
- [ ] Create simple web dashboard — static HTML showing recent alerts + patterns (insight value + scalability)
- [x] Replace Gemini with Groq + eliminate batching — instant AI analysis, 30 RPM, 1,000/day
- [x] Add defensive null checks in Nansen prompt building — fixes production crashes
- [ ] Add 5+ more pattern types to Groq prompt — dormant wallet, accumulation, MEV, etc. (insight value)
- [ ] Feature one real Mantle whale alert (not synthetic) in demo (data source quality)
- [ ] Add "what happened next" tracking — alert if receiving wallet sells within 1 hour (investment utility)

**Time:** 6-12 hours remaining  
**Impact:** Could push score from ~35/50 to 42+/50

### 6. Nansen API Integration
**Status:** ✅ **IMPLEMENTED**
- [x] Pro plan activated (100,630 credits, no 10× penalty)
- [x] Profiler trio integrated: current-balance, pnl-summary, transactions
- [x] Redis caching (7-day TTL)
- [x] Error handling with 1-hour circuit breaker
- [x] Appended to Gemini prompt for richer AI analysis
- [ ] Smart Money labels (premium endpoint) — deferred, 500 credits/address

**Time:** Completed

### 6. Polish
- [ ] Add bot logo to Telegram profile picture
- [ ] Add `/feedback` command for users to flag bad alerts
- [ ] Add weekly summary report (stretch goal)

**Time:** 1-2 hours

---

## Done

- [x] NestJS scaffold + modules
- [x] Mantle WebSocket ingestion
- [x] Telegram bot commands
- [x] Whale detection + wallet tracking
- [x] Price service (CoinGecko + Bybit)
- [x] Gemini AI anomaly analysis
- [x] Batching for rapid same-pair transfers
- [x] Address labels (Bybit, tokens, DEXs)
- [x] Rate limiting (10 alerts/hr)
- [x] Graceful shutdown + crash recovery
- [x] BlockNotFoundError handling
- [x] Health endpoint + Render deploy
- [x] E2E test endpoints
- [x] Smart contract deployed + integrated (Mantle Sepolia: `0xBefF514A...22711`)
- [x] On-chain alert logging verified (tx: `0x69bbeb...01e844`)
- [x] Nansen integration plan written and deferred (`docs/nansen-integration-plan.md`)
- [x] Nansen profiler trio integrated (current-balance, pnl-summary, transactions)
- [x] Demo script written

---

## Notes

- **Nansen credit form:** Submitted May 19, awaiting response
- **Groq quota:** 30 RPM, 1,000/day on free tier. No batching needed.
- **Render free tier:** 512MB RAM, sleeps after 15 min idle. UptimeRobot pings every 5 min.
- **Deadline:** June 16, 2026 — ~4 weeks remaining
