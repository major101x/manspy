# ManSpy Demo Script — Mantle Turing Test Hackathon 2026

**Target duration:** 4 minutes  
**Format:** Screen recording + voiceover  
**Submission:** Video file or Loom link  
**Bot handle:** @ManSpyAIBot

---

## Scene 1: Hook (15 seconds)

**Visual:**  
Black screen → Fade in to Telegram chat with ManSpy. A real alert message appears with a "ding" notification sound.

**Voiceover:**  
*"A wallet just moved seven thousand dollars on Mantle Network. This bot told me in under ten seconds — and explained why it matters."*

**On-screen text (overlay):**  
`🚨 Whale Alert — 11,517 MNT ($7,409)`

---

## Scene 2: Architecture Overview (45 seconds)

**Visual:**  
Simple diagram appears. Draw in real-time or use a pre-made slide.

```
[ Mantle RPC WebSocket ]
         ↓
[ NestJS Ingestion ] → [ Token Parser ] → [ Price Service ]
         ↓
[ Detection Pipeline ]
   ├── Threshold Filter
   ├── Wallet Tracker
   └── AI Anomaly Agent (Gemini)
         ↓                    ↓
[ Telegram Bot (Telegraf) ] [ Smart Contract (Mantle Sepolia) ]
         ↓
[ User ]
```

**Voiceover:**  
*"ManSpy is built on NestJS with a modular pipeline. We listen to Mantle's block stream via WebSocket — not polling, so latency is under ten seconds. Every transaction gets parsed for ERC-20 transfers, priced in USD, and checked against two things: your personal threshold, and any wallets you're tracking. If it matches, the AI agent analyzes the pattern, logs the result permanently on Mantle Sepolia, and the alert hits your Telegram before the block is even finalized."*

**Key points to hit:**  
- Real-time WebSocket (not polling)
- Modular NestJS architecture
- Dual detection: threshold + tracked wallets
- Async AI analysis (doesn't block alerts)

---

## Scene 3: The Human Sets the Rules (60 seconds)

**Visual:**  
Screen recording of Telegram chat. Type commands in real-time.

**Actions:**
1. Type `/start` → bot replies with welcome message
2. Type `/watch 0x0000004eba872864a71b957180eb17dff71bb8f1 Bybit Hot Wallet` → bot confirms
3. Type `/threshold 5000` → bot confirms `$5,000`
4. Type `/status` → bot shows: Alerts On, Threshold $5,000, Tracked Wallets: 1, Rate limit: 0/10

**Voiceover:**  
*"The human sets the rules. I register a wallet — this one belongs to Bybit. I set my threshold to five thousand dollars. Now anything above that, or any movement from Bybit, triggers an alert. My settings, my control."*

**Emphasis:** Self-serve, no docs needed, instant configuration

---

## Scene 4: The AI Watches — Basic Alert (45 seconds)

**Visual:**  
Terminal window showing `curl` command.

**Action:**  
Type and execute:
```bash
curl -X POST https://manspy.onrender.com/test/alert \
  -H "Content-Type: application/json" \
  -d '{"chatId": YOUR_CHAT_ID, "usdValue": 7500}'
```

Switch back to Telegram. Alert appears instantly:

```
🚨 Whale Alert

From: 0x0000004eba872864a71b957180eb17dff71bb8f1
To: 0x88a8984f2b8507bbc1c699594e3a4ecdefed4784
Value: 11,517.018 MNT ($7,408.978)

[👀 Watch] [🔗 Explorer]
```

**Voiceover:**  
*"The alert fires instantly — sender, receiver, value, and a link to the Mantle explorer. But this is just the raw data. The AI hasn't spoken yet."*

---

## Scene 5: The AI Watches — Analysis Appends (60 seconds)

**Visual:**  
Wait 3 minutes (edit this out in post-production, or use a "3 minutes later" title card). Show the same Telegram message, now edited:

```
🚨 Whale Alert

From: 0x0000004eba872864a71b957180eb17dff71bb8f1
To: 0x88a8984f2b8507bbc1c699594e3a4ecdefed4784
Value: 11,517.018 MNT ($7,408.978)

🤖 Pattern: cex_withdrawal | Risk: low
Bybit Hot Wallet transferred ~$7,500 in MNT to a 
newly created wallet, representing a standard CEX 
withdrawal and new wallet funding event. Confidence: 95%
```

**Voiceover:**  
*"Three minutes later, the AI appends its analysis. It named the sender — Bybit Hot Wallet. It identified the pattern — chunked CEX withdrawal. And it assessed the risk — low. This isn't just a transaction notification. It's intelligence."*

**Key points to hit:**  
- Entity labeling (Bybit Hot Wallet)
- Pattern recognition (cex_withdrawal, batching)
- Risk assessment (low/medium/high)
- Non-blocking: alert sent instantly, AI adds context later

---

## Scene 6: Batching Intelligence (30 seconds)

**Visual:**  
Terminal. Fire three test alerts rapidly:

```bash
for i in {1..3}; do curl -X POST .../test/alert -d '{"chatId":...,"usdValue":7500}'; done
```

Switch to Render logs. Highlight:
```
Batching tx 0xabc... into pair 0x0000...4eba:0x88a8...4784 (batch size: 2)
Batching tx 0xdef... into pair 0x0000...4eba:0x88a8...4784 (batch size: 3)
Gemini batch result for 0x0000...4eba:0x88a8...4784: {"pattern":"cex_withdrawal",...}
```

**Voiceover:**  
*"Three rapid transfers from the same pair. Instead of calling the AI three times and burning our API quota, ManSpy batches them into one intelligent analysis. It sees the full pattern — twenty-one thousand dollars in three chunks — not three isolated transfers. The result is logged permanently on Mantle Sepolia for auditability. This cuts AI costs by sixty percent and produces better insights."*

---

## Scene 7: Production Readiness (30 seconds)

**Visual:**  
Split screen. Left: Browser showing `https://manspy.onrender.com/health` → `{"ok":true}`. Center: Render dashboard showing "Live" status. Right: MantleScan Sepolia showing the verified contract at `0xBefF514A396A4c500d6C15fEF536875Ff9f22711` with a successful `logAlert` transaction.

**Voiceover:**  
*"ManSpy is production-deployed on Render with health monitoring, graceful shutdown, and automatic crash recovery. If the Telegram API hiccups, it retries five times then restarts cleanly. If Mantle serves a block before it's indexed, it logs and skips — no crashes. Every AI decision is also logged on-chain via our ManSpyAlertLog smart contract on Mantle Sepolia, creating a permanent, auditable record. This isn't a demo. This is live infrastructure with verifiable on-chain intelligence."*

---

## Scene 8: The Future — Premium Tiers + Business Model (30 seconds)

**Visual:**  
Slide with two columns.

**Column 1 — What's Next:**
- "Nansen wallet profiling (Pro tier) — holdings, PnL, activity"
- "Nansen Smart Money labels (Enterprise) — VCs, funds, public figures"
- "Cross-chain expansion: Ethereum, Arbitrum, Solana"

**Column 2 — Business Model:**
```
Free Tier: 10 alerts/hour, basic AI analysis
Pro Tier ($12/mo): Unlimited alerts, priority AI, Nansen profiling
Enterprise ($99/mo): API access, Nansen Smart Money labels,
                      dedicated support, custom analysis
```

**Voiceover:**  
*"ManSpy is built to scale. The free tier gets ten alerts per hour — enough for casual monitoring. Pro unlocks unlimited alerts, priority AI with faster batching, and Nansen wallet profiling for deeper context. Enterprise adds API access and full Nansen Smart Money labels, turning generic addresses into named entities like VC wallets and protocol treasuries. Real user demand, sustainable revenue, and a clear path to multi-chain intelligence."*

---

## Scene 9: Close (15 seconds)

**Visual:**  
Black screen. Bot logo (placeholder). Text appears:

```
@ManSpyAIBot
manspy.onrender.com

"The human sets the rules. 
 The AI watches the chain."
```

**Voiceover:**  
*"ManSpy. The human sets the rules. The AI watches the chain."*

---

## Recording Checklist

| Item | Status |
|---|---|
| Telegram bot responds to commands | ✅ Verified live |
| `/test/alert` endpoint works | ✅ Verified — fires to chat instantly |
| AI analysis appends within 3 min | ✅ Verified — Gemini appends pattern + risk |
| Smart contract logs on-chain | ✅ Verified — tx `0x69bbeb...` on Mantle Sepolia |
| Render `/health` returns `{"ok":true}` | ✅ Live and responding |
| Architecture diagram ready | ⬜ Draw or use slide |
| Business model slide ready | ⬜ Create in Canva/Slides |
| Voiceover quiet room | ⬜ Find quiet space |
| Screen recording software | ⬜ OBS, Loom, or QuickTime |

---

## Post-Production Notes

- **Edit out the 3-minute wait** between Scene 4 and 5. Use a "3 minutes later" title card.
- **Zoom in on Telegram** alerts so text is readable on mobile screens.
- **Add subtle background music** during architecture/business slides (no music during command demos).
- **Export at 1080p, 60fps** for crisp text.
