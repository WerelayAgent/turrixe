// Everything that changes at launch lives here. Swap the name, ticker, CA and links in one place.
export const config = {
  name: "Turrixe",
  ticker: "TRXE",
  ca: "",                       // empty until the coin exists; modules show "CA drops at launch"
  // The SHA-256 (hex) of the coin address, set before launch so the live feed can reveal the address at launch without
  // the address itself sitting in this public file. The page shows a feed's address only if it is `ca` or hashes to this.
  // node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" <address>
  caHash: "",
  // the coin's pages follow its address: once `ca` is known (here, or revealed by the feed at launch) Buy and Chart
  // point at the coin itself
  links: {
    get pump() { return config.ca ? `https://pump.fun/coin/${config.ca}` : "https://pump.fun"; },
    x: "https://x.com/turrixe",
    get chart() { return config.ca ? `https://dexscreener.com/solana/${config.ca}` : "https://dexscreener.com/solana"; },
  },
  brainMinutes: 15,             // a new brain every 15 minutes
  demoBrainSeconds: 90,         // with ?demo the brain is replaced every 90 seconds so visitors see a swap
  api: null,                    // null by default: runs built-in simulator with real-time thoughts & brain swaps
  live: false,
  feedPage: "live.html",        // live feed page
  home: "index.html",
};

// URL query override: ?api=... allows connecting to a live backend feed
if (typeof location !== "undefined") {
  const q = new URLSearchParams(location.search);
  if (q.has("api")) {
    config.api = q.get("api");
    config.live = !!config.api && q.get("live") !== "0";
  }
}
