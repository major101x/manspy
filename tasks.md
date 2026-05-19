# ManSpy — Remaining Tasks

**Deadline:** June 16, 2026  
**Current Status:** MVP complete, deployed, demo script written

---

## Critical (Must Do)

### 1. Record Demo Video
- [ ] Test `/test/alert` endpoint on production (verify it fires to your chat)
- [ ] Test 3 rapid alerts to verify batching works
- [ ] Wait 3 min, verify AI analysis appends
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

### 5. Nansen API Integration
- [ ] Wait for Nansen credit approval
- [ ] Integrate REST API for wallet labels
- [ ] Replace hardcoded `AddressLabelService` with live Nansen data
- [ ] Add Smart Money label detection to AI prompt

**Time:** 2-4 hours  
**Dependencies:** Nansen credits approved

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
- [x] Demo script written

---

## Notes

- **Nansen credit form:** Submitted May 19, awaiting response
- **Gemini quota:** 5 req/min, 20/day. Batching helps stay under limit.
- **Render free tier:** 512MB RAM, sleeps after 15 min idle. UptimeRobot pings every 5 min.
- **Deadline:** June 16, 2026 — ~4 weeks remaining
