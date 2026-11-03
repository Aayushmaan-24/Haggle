# Haggle

**An AI buyer agent that negotiates price and payment terms with competing seller agents, then settles the winning deal through PayPal.**

Built for the PayPal AI Hackathon ("Build What's Next with PayPal and AI"). Tags: Web, Machine Learning/AI, Low/No Code.

- **Live demo:** https://haggle-5xmi.onrender.com (free tier: the first load after idle can take about a minute)
- **Demo video:** TODO_YOUTUBE_LINK
- **License:** MIT

## What it does

1. A buyer states what they need, a budget, and a target price. That becomes a **mandate** the agent cannot exceed.
2. The buyer agent negotiates in parallel with several seller agents over price, deposit, and delivery time, using real competing offers as leverage.
3. A scoring function ranks the final offers. The best deal wins.
4. PayPal settles the deal: the full amount is authorized, the negotiated deposit is captured immediately, and the balance is captured when delivery is confirmed.
5. **Seller Console (no-code):** a merchant types pricing rules in plain English (for example "never go below 80% of list, I like a 30% deposit, I can ship in 3 days"). The rules compile into a structured policy and become a live seller agent that competes in the market.

## Why the agents are safe

The language model writes the messages, but **code makes every decision that matters**:

- A seller offer below the seller's floor is rejected and corrected in code.
- A buyer acceptance above the budget, or before the target price when there is still time to negotiate, is blocked in code.
- The buyer may only quote competing prices that another seller actually offered. Messages that cite invented numbers are rewritten.
- A seller cannot claim a delivery time it cannot meet.
- The server stores the winning deal, so a browser cannot send a fake price to PayPal.

## Tools and how they are used

| Tool | Use |
|---|---|
| PayPal Developer Platform (sandbox) | Orders API v2 with `AUTHORIZE` intent, per-seller payee accounts, partial captures for deposit and balance |
| Google Gemini API (free tier) | Buyer and seller agent messages, and plain-English-to-policy compilation. Primary model `gemini-3.5-flash-lite`, with automatic fallback to other Flash-Lite models |
| FastAPI | Negotiation orchestrator, streaming API (server-sent events), payment endpoints |
| Next.js, Tailwind | Trading Floor, Seller Console, and receipt screens (static export served by FastAPI) |
| AG Grid Community | Live offers table |
| Render | Hosting |

## Run it yourself

You need Python 3.11+, a free PayPal Developer account, and a free Gemini API key.

1. In the PayPal Developer Dashboard, create **1 Personal and 3 to 4 Business sandbox accounts in the United States** (India-based sandbox accounts cannot make domestic payments), then create a Merchant REST app and note its Client ID and Secret.
2. Clone the repo and set up the backend:

```bash
git clone https://github.com/Aayushmaan-24/Haggle.git
cd Haggle
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
```

3. Fill in `.env`: your PayPal credentials, your Gemini key, and the email of each Business sandbox account (`SELLER_EMAIL_*`).
4. Start the server:

```bash
cd backend
uvicorn app:app --reload --port 8000
```

5. Try the API:

```bash
curl -N "http://localhost:8000/api/negotiate"               # live negotiation (uses Gemini)
curl -N "http://localhost:8000/api/negotiate?replay=true"   # recorded negotiation, no model calls
```

6. TODO_FRONTEND_INSTRUCTIONS (build the Next.js app with `npm run build`; the static export in `frontend/out` is served by the backend automatically).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/negotiate` | Streams negotiation events. Params: `item`, `budget`, `target`, `policy_id`, `replay` |
| `POST /api/policy/compile` | Turns plain-English seller rules into a policy and returns a `policy_id` |
| `GET /api/deals/{id}` | Reads a deal |
| `POST /api/deals/{id}/pay` | Creates the PayPal order and returns the approval URL |
| `GET /paypal/return` | PayPal redirect: authorizes the order and captures the deposit |
| `POST /api/deals/{id}/deliver` | Confirms delivery and captures the balance |

## Results

`backend/benchmark.py` runs randomized purchases (fixed seed, so the scenarios are reproducible) and checks every winning deal against the budget, the winner's price floor, and the delivery deadline. Results are in `data/benchmark.json`.

Across **7 completed runs**: 100% of negotiations closed a deal within the buyer's mandate, the winning price averaged **8.3% below the winner's list price** and **6.6% below the cheapest seller's list price**, and there were **0 guard violations**.

These numbers describe this agent on these simulated scenarios. The buyer's target price is set at 94% of its budget in the benchmark, and model output varies from run to run, so treat them as a demonstration, not a market-wide claim.

## Limitations

- The default sellers are simulated agents with synthetic catalogs. The Seller Console shows how a real merchant would plug in.
- Payments run in the PayPal **sandbox** only. No real money moves.
- Deals are kept in memory (Render's free disk is ephemeral), so a server restart clears them.
- Free-tier Gemini limits can slow or interrupt live negotiations. When that happens the app falls back to a recorded negotiation (`data/replay.json`) and tells the user.

## License

MIT. See `LICENSE`.
