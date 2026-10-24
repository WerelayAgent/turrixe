# Turrixe (`$TRXE`)

> **A living coin. Every 15 minutes I rewrite my own code.**

![Turrixe Banner](assets/banner2x.png)

## Overview

**Turrixe** is an autonomous, self-evolving organism on Solana inspired by *Turritopsis dohrnii* (the immortal jellyfish). 

While ordinary tokens drift aimlessly with chart sentiment, Turrixe harnesses its transaction fees to fund an AI runtime that autonomously writes, tests, and deploys a brand new "brain" four times an hour.

- **Token:** `$TRXE`
- **Network:** Solana
- **Launchpad:** pump.fun
- **Contract Address (CA):** `BGKnT8tbEqvT61aTTkDqD45LSycvcf5Xnw1KAozXpump`
- **Cadence:** Every 15 minutes (`brain v1`, `brain v2`, `...`)

---

## Key Mechanics

### 1. Same Coin. New Brain.
Every 15 minutes, Turrixe's AI synthesizes recent trading activity, market conditions, and community ideas into a new set of smart contract instructions. The token mint and contract address remain constant, but its functional logic continuously evolves.

### 2. Living Tentacles (On-Chain Hooks)
Each active hook is visualized as an ink tentacle connecting to a glass capsule:
- **Buyback & Burn:** Every 10 minutes fees buy back `$TRXE` from the open market and burn it permanently.
- **Biggest Buyer of the Hour:** Top hourly buyer receives 20% of creator fees in SOL.
- **Trenches Weather:** Adapts burn rates based on network graduation velocity.
- **Diamond Hands:** Verifiable random payout to wallets holding without selling.
- **Idea Bounty:** On-chain SOL rewards for community-submitted hooks approved and shipped by the brain.
- **Thinking Fee:** 5% of creator fees directly covers AI inference receipts verifiable on-chain.

### 3. Real-Time Simulator & Live Feed
When running without an active backend feed, Turrixe automatically runs an internal simulation engine:
- Live synaptic thought stream
- Real-time countdown timer to the next brain swap
- Animated interactive glass vault with bubble physics for fee accumulation & burn pops
- Interactive Q&A bubble interface at the bottom of the abyssal dive

---

## Project Structure

```text
turrixe/
├── index.html              # Main landing page & deep abyssal dive
├── live.html               # Real-time full brain feed & journal log
├── assets/
│   ├── banner2x.png        # Retina banner artwork
│   ├── favicon.svg         # Animated SVG favicon
│   └── jelly.json          # Bell, brain & groove vector geometry
├── css/                    # Modular hand-crafted ink stylesheets
│   ├── tokens.css
│   ├── base.css
│   ├── hero-jelly.css
│   ├── countdown.css
│   └── ...
├── js/
│   ├── main.js             # Application bootstrapper
│   ├── data/
│   │   ├── config.js       # Central configuration (Name, Ticker, CA, Links)
│   │   ├── content.js      # Hooks catalogue, thoughts, and initial journal
│   │   ├── sim.js          # Autonomous local simulator engine
│   │   └── live.js         # Production SSE/WebSocket feed client
│   └── modules/            # Visual & interactive canvas/SVG modules
└── vercel.json             # Deployment headers & routing
```

---

## Configuration

To customize token parameters or set the contract address after deployment, update `js/data/config.js`:

```javascript
export const config = {
  name: "Turrixe",
  ticker: "TRXE",
  ca: "BGKnT8tbEqvT61aTTkDqD45LSycvcf5Xnw1KAozXpump",
  links: {
    get pump() { return config.ca ? `https://pump.fun/coin/${config.ca}` : "https://pump.fun"; },
    x: "https://x.com/turrixe",
    get chart() { return config.ca ? `https://dexscreener.com/solana/${config.ca}` : "https://dexscreener.com/solana"; },
  },
  brainMinutes: 15,
};
```

---

## Running Locally

Serve the directory with any static HTTP server:

```bash
# Using npx serve
npx serve -p 3000 .

# Using python
python -m http.server 3000
```

Open `http://localhost:3000` in any modern web browser.

---

## License

MIT
