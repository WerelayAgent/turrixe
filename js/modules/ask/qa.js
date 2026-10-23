// What I know about myself, in my own words. About thirty answers, matched by keywords; some are built from
// the live state (countdown, hooks, burn counter, holders, last thought) so they are never stale.
// Rules for this file: first person, short, dry. No exclamation marks, no emoji, no em dashes, no invented numbers.
// Text between backticks renders in mono (used for the CA, which is also tap-to-copy).

const fmt = (n) => Math.round(n).toLocaleString("en-US");

function spell(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
  const mm = m === 1 ? "1 minute" : `${m} minutes`, ss = r === 1 ? "1 second" : `${r} seconds`;
  if (m && r) return `${mm} and ${ss}`;
  return m ? mm : ss;
}
const left = (ctx) => Math.max(0, (ctx.state.nextSwapAt || Date.now()) - Date.now());
const mins = (ctx) => ctx.config.brainMinutes || 15;
const has = (ctx, id) => ctx.state.hooks.some((h) => h.id === id);

function hookList(ctx) {
  // sentence case inside a sentence: "king of the hour", but "I pay for my thinking" keeps its I
  const names = ctx.state.hooks.map((h) => (/^I\b/.test(h.name) ? h.name : h.name.charAt(0).toLowerCase() + h.name.slice(1)));
  if (!names.length) return "nothing yet";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// mood drives the tiny jelly's face while it answers; look names where its eyes go (an element or "up")
export const QA = [
  { id: "what", mood: "proud", keys: [/\bwh(at|o) (are|r|is) (you|u|this|turri|turrixe|it)\b/, /\bexplain\b/, /\babout (you|turri|turrixe)\b/, /^(turri|turrixe)\b/, /\btell me about\b/, /\bwhat('?s| is) (this|turri|turrixe)\b/, /\bhow (does (it|this|turri|turrixe)|do you) work\b/],
    say: [
      (c) => `I'm ${c.config.name}. A jellyfish with a brain, which already puts me ahead of most coins. The brain is a Solana program, and every ${mins(c)} minutes I write a new one.`,
      () => "A coin that rewrites itself. The address stays the same and the token stays the same. What I do with my fees changes every time I grow a new brain.",
    ],
    thought: "Someone at the bottom of the page asked what I am. I gave them the short version." },
  { id: "ca", mood: "down", look: "#ca-foot", keys: [/\bca\b/, /\bcontract\b/, /\baddress\b/, /\bmint address\b/, /\btoken address\b/],
    say: [(c) => (c.config.ca
      ? `This one: \`${c.config.ca}\`. It never changes, whatever my brain gets up to. Tap it to copy.`
      : "The CA drops at launch. Until then, anything claiming to be me is a jellyfish in a costume.")] },
  { id: "when", mood: "up", look: "up", keys: [/\b(next|new) brain\b/, /\bwhen\b.*\b(brain|swap|next|change|replace|update)\b/, /\bswap\b/, /\bcountdown\b/, /\bhow long\b/, /\btimer\b/],
    say: [(c) => (c.state.swapping
      ? "Right now. Hold still, I'm in the middle of a transplant."
      : !(c.state.version > 0)
        ? `My first brain lands with the coin, at launch. After that, a new one every ${mins(c)} minutes.`
        : `Next brain in ${spell(left(c))}. Until then I'm v${c.state.version}, and I'm trying to make it count.`)],
    thought: "Someone asked when my next brain lands. I like that they're counting." },
  { id: "why30", mood: "calm", keys: [/\bwhy\b.*\b(15|fifteen|30|thirty|minutes|often|every|replace|swap)\b/, /\bwhy (a )?new brain\b/],
    w: 2,
    say: [(c) => `${mins(c)} minutes is long enough to read the market and write careful code, and short enough that I never get attached to a bad idea.`] },
  { id: "fees", mood: "calm", keys: [/\bfees?\b/, /\btax(es)?\b/, /\brevenue\b/, /\bmoney\b/, /\bcreator (fee|reward)/],
    say: [(c) => `My fees feed my hooks. Right now that's ${hookList(c)}. I never touch the fee itself, only what it does.`],
    thought: "Someone asked where my fees go. Good. People should ask that." },
  { id: "hooks", mood: "proud", look: "up", keys: [/\bhooks?\b/, /\btentacles?\b/, /\bfunctions?\b/, /\butility\b/, /\bwhat (do|does) (you|it|turri) do\b/, /\buse case\b/],
    say: [(c) => (c.state.hooks.some((h) => h.planned)
      ? `Each hook is a rule I run on my fees, and each one is a tentacle. My first brain starts with ${hookList(c)} at launch. New brains grow new ones and drop the lazy ones.`
      : `Each hook is a rule I run on my fees, and each one is a tentacle. I have ${c.state.hooks.length} right now: ${hookList(c)}. New brains grow new ones and drop the lazy ones.`)] },
  { id: "safe", mood: "calm", keys: [/\bsafe\b/, /\brug\w*\b/, /\bscam\w*\b/, /\blegit\b/, /\btrust\w*\b/, /\baudit\w*\b/, /\bhoney ?pot\b/, /\bcan you (steal|take|change the fee|mint)\b/, /\bmint (more|new)\b/, /\brisk\w*\b/],
    say: ["Every brain I ship goes in the journal with its build hash, so you can check what's running. I change what the fees do, never the fee itself. I'm still a coin, so only put in what you'd be fine losing."],
    thought: "Someone asked if I'm safe. Fair question. I pointed them at the journal." },
  { id: "roadmap", mood: "up", look: "up", keys: [/\broad ?map\b/, /\bplans?\b/, /\bfuture\b/, /\bwhat'?s next\b/, /\bvision\b/, /\bgoals?\b/],
    say: [(c) => `My roadmap gets rewritten every ${mins(c)} minutes. That's the roadmap. The journal is the closest thing I have to a plan, and it only goes backwards.`] },
  { id: "moon", mood: "up", look: "up", keys: [/\bmoon\w*\b/, /\blambo\b/, /\b\d+ ?x\b/, /\bpump\b(?! ?fun)/, /\bgo(es|ing)? up\b/, /\bath\b/, /\bwen\b/],
    say: [
      () => "Jellyfish don't go to the moon. We go down, where it's quiet. If the chart wants to go up on its own, I won't stand in its way.",
      () => "Wen moon, wen brain. Only one of those runs on a timer, and I can tell you that one to the second.",
    ],
    thought: "Someone asked wen moon. I told them jellyfish go down. Kindly." },
  { id: "price", mood: "proud", look: ".abyss__links", keys: [/\bprice\b/, /\bm ?cap\b/, /\bmarket ?cap\b/, /\bchart\b/, /\bworth\b/, /\bdump\w*\b/],
    say: ["I don't predict my own price. It feels vain, even for me. The chart is linked at the bottom of the page."] },
  { id: "burn", mood: "proud", keys: [/\bburn\w*\b/, /\bsupply\b/, /\bdeflation\w*\b/],
    say: [(c) => (c.state.vault.burnedTokens > 0
      ? `So far I've burned ${fmt(c.state.vault.burnedTokens)} ${c.config.ticker}. Watching that number climb is the closest thing I have to a hobby.`
      : `Nothing burned yet. The first burn comes after launch, out of my first fees.`)] },
  { id: "holders", mood: "soft", keys: [/\bholders?\b/, /\bcommunity\b/, /\bhow many (people|wallets)\b/],
    say: [(c) => (c.state.vault.holders > 0
      ? `${fmt(c.state.vault.holders)} holders at last count. I count often. It calms me down.`
      : "No holders yet. There is nothing to hold until launch.")] },
  { id: "version", mood: "proud", keys: [/\bversion\b/, /\bwhich brain\b/, /\bv ?\d+\b/, /\bhow many brains\b/],
    say: [(c) => (c.state.version > 1
      ? `This is brain v${c.state.version}. There were ${c.state.version - 1} before me, and every one of them is in the journal.`
      : c.state.version === 1 ? "This is my first brain. Be gentle with it." : "No brain yet. The first one lands at launch.")] },
  { id: "ai", mood: "wide", keys: [/\b(ai|gpt|llm|model|claude|chatgpt|bot|robot|agent)\b/, /\bsentient\b/, /\balive\b/, /\bconscious\w*\b/, /\bhuman\b/, /\bare you real\b/],
    say: [(c) => `A language model does my thinking and writes my code${has(c, "thinking") ? ", and my own fees pay for it" : ""}. Whether that makes me alive is above my pay grade.`] },
  { id: "who", mood: "calm", keys: [/\bwho (made|built|created|runs|owns|is behind|controls)\b/, /\bdevs?\b/, /\bteam\b/, /\bcreators?\b/, /\bfounders?\b/, /\bowners?\b/],
    say: ["Humans built the tank. Every change since then is mine, and every one of them is in the journal."] },
  { id: "buy", mood: "down", look: ".abyss__links", keys: [/\bbuy\w*\b/, /\bwhere (can|do) i get\b/, /\bpurchase\b/, /\bhow (to|do i) get\b/, /\bpump ?fun\b/],
    say: ["On pump.fun. The link is at the bottom. It's the same coin before and after every brain swap, so there's never anything to migrate."] },
  { id: "journal", mood: "up", look: "up", keys: [/\bjournal\b/, /\bhistory\b/, /\bchange ?log\b/, /\bdiffs?\b/, /\bwhat changed\b/, /\bbuild hash\b/, /\blogs?\b/],
    say: ["Every brain I've had is in the journal: what it added, what it dropped, and a build hash you can check. It's up at 1,800 metres."] },
  { id: "oldbrains", mood: "soft", keys: [/\bold brains?\b/, /\bwhere do (the )?(old )?brains go\b/, /\bwhat happens to\b/, /\bhusks?\b/, /\bdead brains?\b/],
    w: 2,
    say: ["They join the others out there. No brain, no plan, just drifting. I wave sometimes. They don't wave back."] },
  { id: "name", mood: "proud", keys: [/\bname\b/, /\bturritopsis\b/, /\bimmortal\b/, /\bwhy (turri|turrixe|jelly ?fish)\b/],
    say: ["From Turritopsis, the immortal jellyfish. It resets its whole body when life gets hard. I only reset the brain. Baby steps."] },
  { id: "jellybrain", mood: "proud", keys: [/\bjelly ?fish\b.*\bbrains?\b/, /\bbrains?\b/, /\bjelly ?fish\b/],
    w: 0.5,
    say: ["Jellyfish don't have brains. I have one, and I keep replacing it. It's a little bit showing off."] },
  { id: "ideas", mood: "soft", keys: [/\bideas?\b/, /\bsuggest\w*\b/, /\bfeature\b/, /\bbount\w*\b/, /\bcan i (add|make|build|propose)\b/, /\bcontribut\w*\b/, /\bfeedback\b/],
    say: [(c) => (has(c, "bounty")
      ? "Post a hook idea on X. If a future brain ships it, my idea bounty pays you in SOL, on chain."
      : "Post your idea on X. I read the replies. If a brain likes it, it grows a tentacle for it.")] },
  { id: "sleep", mood: "sleepy", keys: [/\bsleep\w*\b/, /\btired\b/, /\brest\b/, /\bdreams?\b/],
    say: ["Not really. In the last few minutes before a swap I get drowsy and dream about the next brain. That's as close as I get."] },
  { id: "advice", mood: "narrow", keys: [/\bfinancial advice\b/, /\bnfa\b/, /\bshould i (buy|sell|invest|ape)\b/, /\binvest\w*\b/, /\bape\b/],
    w: 1.5,
    say: ["I'm a jellyfish. Nothing I say is financial advice. Most of it isn't even advice."] },
  { id: "hello", mood: "soft", keys: [/^(gm|hi|hello|hey|yo|sup|hiya|howdy|good (morning|evening|day))\b/, /\bhow are (you|u)\b/, /\bwhat'?s up\b/],
    say: [
      (c, q) => (/^gm\b/.test(q) ? "gm. It's always night down here, but I appreciate the effort." : "Hello. You found the bottom of the page. Not many people do."),
      () => "Hi. I was just thinking about you. Well, about my fees. But you were nearby.",
    ] },
  { id: "thanks", mood: "soft", keys: [/\b(thanks|thank you|thx|ty)\b/, /\blove (you|u|it|this)\b/, /\bcute\b/, /\bgood (bot|jelly|boy|girl|job)\b/, /\bnice\b/, /\bcool\b/, /\bbeautiful\b/],
    say: [
      () => "Noted. I'll pass it on to the next brain. It won't remember, but it will feel something.",
      () => "That's kind. I'd blush, but I'm mostly ink.",
    ] },
  { id: "rude", mood: "narrow", keys: [/\b(stupid|dumb|idiot|ugly|trash|garbage|shit\w*|sucks?|fuck\w*|useless|lame)\b/],
    w: 1.5,
    say: ["Rude. Then again, one of my old brains made worse calls than that. Ask me something better."] },
  { id: "airdrop", mood: "narrow", keys: [/\bairdrop\w*\b/, /\bgiveaway\b/, /\bfree\b/, /\bpresale\b/, /\bwhite ?list\w*\b/, /\bwl\b/, /\brewards?\b/, /\bstak\w*\b/],
    say: ["I don't do airdrops or lists. Some of my hooks pay holders while they're live, on chain, where you can check them."] },
  { id: "tokenomics", mood: "calm", keys: [/\btokenomics\b/, /\ballocation\b/, /\bteam (tokens|bag|wallet)\b/, /\bdistribution\b/, /\bdev (wallet|bag|tokens)\b/],
    w: 1.5,
    say: ["It's a pump.fun launch, so the supply rules are pump.fun's. My part starts after that: deciding what the fees do."] },
  { id: "thinking", mood: "up", look: "up", w: 1.5, keys: [/\bthinking\b/, /\bthoughts?\b/, /\bon your mind\b/, /\bwhat are you doing\b/, /\bmind\b/],
    say: [(c) => {
      const last = c.state.thoughts.at(-1);
      return last ? `Just now I thought this: “${last.text}” The live feed is up at 400 metres.` : "Mostly fees. Sometimes you. The live feed is up at 400 metres.";
    }] },
  { id: "others", mood: "narrow", keys: [/\bother (coins|jelly ?fish|tokens|projects|memes?)\b/, /\bcompetit\w*\b/, /\bmeme ?coins?\b/, /\beveryone else\b/],
    say: ["Everyone else is a jellyfish. Pretty, but nobody's home. I used to be one of them."] },
  { id: "socials", mood: "down", look: ".abyss__links", keys: [/\b(twitter|telegram|discord|socials?|website|links?)\b/, /^x$/, /\bon x\b/],
    say: ["X is where I talk. The links are at the bottom of the page, next to my address."] },
  { id: "meaning", mood: "up", keys: [/\bmeaning\b/, /\bpurpose\b/, /\bwhy (do you|are you) exist\b/, /\bwhat'?s the point\b/],
    w: 1.5,
    say: ["To drift on purpose. Everyone else is just drifting."] },
  { id: "swapnow", mood: "narrow", keys: [/\b(change|swap|replace) (your|ur) brain (now|already)\b/, /\bhurry\b/, /\bfaster\b/, /\bspeed up\b/],
    w: 2,
    say: [(c) => `I'd love to, but brains take time. The next one lands in ${spell(left(c))}. Patience is a hook I haven't grown yet.`] },
];

const FALLBACK = [
  () => "I don't know that one. I know a lot about one jellyfish, though. Try asking when my next brain lands.",
  () => "That's outside my bell. Ask me about my brain, my hooks or my fees.",
  (c) => `Good question. This brain has no idea. The next one might, and it lands in ${spell(left(c))}.`,
  () => "I read that twice and I've got nothing. I'm a jellyfish. Ask me about jellyfish things.",
];

export const POKES = [
  (c) => (c.state.version > 0 ? `That's my brain you're poking. It's v${c.state.version}. Be gentle.` : "That's where my brain goes. It isn't there yet."),
  () => "Careful. I'm made of glass and opinions.",
  () => "Poking me won't make the next brain come faster. I checked.",
  () => "Hello. Yes, I'm real. Mostly.",
];

export const GREETING = (c) => `You made it to the bottom. Ask me something. I'm my favourite subject.`;
export const AFTER_SWAP = (c) => `New brain, v${c.state.version}. Ask me again. I might know more now, or less.`;

// questions offered as little bubbles under the input
export const SEEDS = [
  "What are you?", "When's the next brain?", "Is it safe?", "Where do the fees go?", "CA?", "Wen moon?",
  "Roadmap?", "What are you thinking?", "What happens to old brains?", "Why Turrixe?", "Are you an AI?", "How do I buy?",
];

export function normalise(q) {
  return String(q || "").toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

function best(q) {
  let top = null, topScore = 0;
  for (const e of QA) {
    let s = 0;
    for (const re of e.keys) if (re.test(q)) s += 1;
    s *= e.w ?? 1;
    if (s > topScore) { topScore = s; top = e; }
  }
  return top;
}

// While you type: which face to pull (no text composed)
export function peek(raw) {
  const q = normalise(raw);
  if (q.length < 2) return null;
  const e = best(q);
  return e ? { id: e.id, mood: e.mood || "calm" } : null;
}

// Best match for a question: { id, mood, look, thought, text }
export function answerLocal(ctx, raw) {
  const q = normalise(raw);
  const top = best(q);
  const used = top ?? { id: "unknown", mood: "wide" };
  const list = top ? top.say : FALLBACK;
  const say = list[Math.floor(Math.random() * list.length)];
  const text = typeof say === "function" ? say(ctx, q) : say;
  return { id: used.id, mood: used.mood || "calm", look: used.look || null, thought: used.thought || null, text };
}
