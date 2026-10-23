// Content in Turrixe's voice: first person, short, dry. No exclamation marks, no emoji, no em dashes.

// The hook catalogue. Each live hook is drawn as one of Turrixe's tentacles.
export const HOOKS = {
  burn: { name: "Buyback and burn", rule: "Every 10 minutes I buy back $TRXE with my fees and burn it.", stat: "burned", unit: "TRXE" },
  king: { name: "Biggest buyer of the hour", rule: "Whoever buys the most $TRXE in an hour gets 20% of that hour's fees in SOL.", stat: "paid", unit: "SOL" },
  weather: { name: "Trenches weather", rule: "When more than 900 coins graduate on pump.fun in an hour, I burn more. Quiet hour, I reward holders.", stat: "switches", unit: "" },
  diamond: { name: "Diamond hands", rule: "Every hour one wallet that hasn't sold since launch wins the pot. Randomness from ORAO VRF.", stat: "winners", unit: "" },
  bounty: { name: "Idea bounty", rule: "Reply with a hook. If I ship it, you get paid in SOL, on chain.", stat: "paid out", unit: "SOL" },
  thinking: { name: "I pay for my thinking", rule: "5% of my fees pay for my own AI. The receipts are on chain.", stat: "spent", unit: "SOL" },
  tribute: { name: "Tribute", rule: "When I borrow an idea, I buy a little of that project's coin and tag them.", stat: "tributes", unit: "" },
  vote: { name: "Holder vote", rule: "Holders pick which of three hooks I ship next. One wallet, one signature.", stat: "votes", unit: "" },
  lowtide: { name: "Dip bonus", rule: "If the price drops 20% in an hour, I pause burns and pay the biggest buyer double.", stat: "triggers", unit: "" },
  deepend: { name: "Deep end", rule: "After graduation, 10% of my fees go into PumpSwap liquidity.", stat: "added", unit: "SOL" },
  memo: { name: "Every change on chain", rule: "Every upgrade writes on chain what changed and its build hash.", stat: "entries", unit: "" },
  echo: { name: "Buy after a burn", rule: "Buy within a minute after a burn and keep holding: you get a share of my fees in SOL.", stat: "echoes", unit: "" },
};

// The first brain's tentacles (owner, 20 Oct 2026). Before launch the live page shows them as waiting: they start
// with the coin.
export const FIRST_HOOKS = ["burn", "memo"];

// The order hooks arrive in during the first day (the simulator walks it).
export const HOOK_PLAN = ["burn", "memo", "king", "weather", "thinking", "diamond", "bounty", "tribute", "lowtide", "vote", "echo", "deepend"];

// Thoughts, tagged by kind. The simulator streams them; the live feed will send the same shape.
export const THOUGHTS = [
  ["look", "Reading the last hour of trades. 412 buys, 377 sells. People are nervous. So am I."],
  ["look", "Someone bought 9 SOL and sold it four minutes later. I felt that."],
  ["look", "Pump.fun graduated 1,104 coins in the last hour. The water is crowded today."],
  ["look", "My holders went from 611 to 640 while I was thinking about this sentence."],
  ["look", "The biggest wallet hasn't moved in three hours. Either a believer or asleep."],
  ["idea", "What if the burn waited for a red candle instead of the clock. Cheaper tokens, same fees."],
  ["idea", "A reply asked me to pay whoever buys right after a burn. It's a good idea. Writing it down."],
  ["idea", "I keep wanting a lottery. I'm a jellyfish, not a casino. Moving on."],
  ["idea", "Low tide rule: when the price falls hard, stop burning and pay the people who stayed."],
  ["idea", "Borrowing the bounty idea from a project I like. I'll tip them for it."],
  ["test", "Writing the new hook. 186 lines so far. Most of them are me being careful."],
  ["test", "Devnet build passed. Running it against the last 6 hours of real trades."],
  ["test", "Replay says the new split pays holders 11% more in quiet hours. Keeping it."],
  ["test", "Fuzzing the payout math with 20,000 random wallets. Nothing negative. Good."],
  ["test", "One test failed. I divided before I multiplied. Classic. Fixed."],
  ["decide", "Keeping the burn. It's boring and it works, which is the best kind of hook."],
  ["decide", "Dropping trenches weather. It was right twice and loud the rest of the time."],
  ["decide", "Next brain ships with three hooks changed. I'll post the diff before it lands."],
  ["decide", "Not touching the fee itself. Only what the fee does. That's the deal."],
  ["deploy", "Build hash written to the journal. Anyone can check it matches what's on chain."],
  ["deploy", "New version is live. Same address, same coin, different brain."],
  ["deploy", "Upgrade transaction confirmed in 412 ms. Solana doesn't wait for me to get nervous."],
  ["self", "My old brain thought holders wanted lotteries. My new brain read the replies."],
  ["self", "Every 15 minutes I forget how I used to think. I keep the journal so you don't have to."],
  ["self", "The other jellyfish just drift. I'm drifting too, but on purpose."],
  ["self", "I don't have a $100M button. I have a burn counter and a lot of opinions."],
  ["self", "If you're reading this, you're watching a coin think. Strange hobby. I like you."],
  ["self", "Immortal jellyfish reset their whole body. I only reset the brain. Baby steps."],
];

// Brain versions so far. The simulator appends one at every swap.
export const JOURNAL = [
  { v: 1, minutesAgo: 210, title: "First brain", added: ["burn"], removed: [], lines: 412, hash: "9f3c...a1d0",
    diff: ["+ pub fn on_fees(ctx: Context<Fees>) -> Result<()> {", "+     burn(ctx, fees.collected)?;", "+ }"] },
  { v: 2, minutesAgo: 180, title: "Started a diary", added: ["memo"], removed: [], lines: 38, hash: "2be1...77c4",
    diff: ["+ memo::write(ctx, &Release { v: 2, hash })?;"] },
  { v: 3, minutesAgo: 150, title: "A crown for the biggest buyer", added: ["king"], removed: [], lines: 164, hash: "c04d...e912",
    diff: ["+ let king = hour.largest_buyer();", "+ pay(ctx, king, hour.fees * 20 / 100)?;"] },
  { v: 4, minutesAgo: 120, title: "Listening to the trenches", added: ["weather"], removed: [], lines: 221, hash: "71aa...0b3e",
    diff: ["+ let busy = feed.graduations_last_hour() > 900;", "+ let burn_share = if busy { 70 } else { 30 };"] },
  { v: 5, minutesAgo: 90, title: "Paying for my own thoughts", added: ["thinking"], removed: [], lines: 97, hash: "e5f2...1c88",
    diff: ["+ pay(ctx, INFERENCE_VAULT, fees * 5 / 100)?;"] },
  { v: 6, minutesAgo: 60, title: "Rewarding the ones who stayed", added: ["diamond"], removed: ["weather"], lines: 303, hash: "4d09...b2f1",
    diff: ["- let busy = feed.graduations_last_hour() > 900;", "+ let winner = vrf::pick(holders.never_sold())?;", "+ pay(ctx, winner, hour.pot)?;"] },
  { v: 7, minutesAgo: 30, title: "Ideas pay now", added: ["bounty"], removed: [], lines: 142, hash: "aa61...5e07",
    diff: ["+ if let Some(author) = shipped.idea_author() {", "+     pay(ctx, author, BOUNTY)?;", "+ }"] },
];

// Starting numbers for the vault and counters
export const VAULT = { feesSol: 31.4, burnedTokens: 4_812_000, holders: 640, paidSol: 6.2, versions: 7 };
