// Where answers come from: the live brain at config.api, or without one the local Q&A in qa.js. Contract:
//   POST {api}/ask   body {"q": "...", "version": 7}
//   -> application/json {"text": "...", "mood"?: "calm|proud|up|down|soft|narrow|wide|sleepy", "topic"?: "..."}
//   -> or 202 {"id"}: the brain is thinking (a model run takes 6 to 30 s); GET {api}/ask/{id} answers
//      {"status": "thinking"} until it is {"status": "done", "text", "mood"}. The jelly thinks meanwhile.
//   -> or any text stream (text/plain, text/event-stream "data:" lines): words are typed as they arrive.
// Anything slow (over 9 s to first byte, or a job not done in a minute) or broken falls back to the local answers,
// said honestly.
import { answerLocal } from "./qa.js";

const TIMEOUT = 9000;
const JOB_WAIT = 60000;
const POLL = 1500;

export function createSource(ctx) {
  const local = (q) => {
    const a = answerLocal(ctx, q);
    return { ...a, stream: once(a.text) };
  };

  async function remote(q, signal) {
    const base = String(ctx.config.api).replace(/\/+$/, "");
    const ctl = new AbortController();
    const kill = setTimeout(() => ctl.abort(), TIMEOUT);
    signal?.addEventListener("abort", () => ctl.abort(), { once: true });
    try {
      const res = await fetch(`${base}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream, text/plain" },
        body: JSON.stringify({ q, version: ctx.state.version }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`ask ${res.status}`);
      clearTimeout(kill);
      const guess = answerLocal(ctx, q);   // the local matcher still picks a face for the jelly
      if (res.status === 202) {
        const { id } = await res.json();
        const j = await waitFor(base, String(id || ""), signal);
        const text = String(j.text || "").trim();
        if (!text) throw new Error("empty answer");
        return { ...guess, mood: j.mood || guess.mood, text, stream: once(text) };
      }
      const type = res.headers.get("content-type") || "";
      if (type.includes("json")) {
        const j = await res.json();
        const text = String(j.text || j.answer || "").trim();
        if (!text) throw new Error("empty answer");
        return { ...guess, mood: j.mood || guess.mood, id: j.topic || guess.id, text, stream: once(text) };
      }
      return { ...guess, text: null, stream: readStream(res.body, type.includes("event-stream")) };
    } finally {
      clearTimeout(kill);
    }
  }

  // the brain is thinking: ask for the answer every POLL ms, for a minute at most
  async function waitFor(base, id, signal) {
    if (!/^[A-Za-z0-9_-]{8,24}$/.test(id)) throw new Error("bad job id");
    const end = Date.now() + JOB_WAIT;
    while (Date.now() < end) {
      await new Promise((r, x) => {
        const t = setTimeout(r, POLL);
        signal?.addEventListener("abort", () => { clearTimeout(t); x(new DOMException("aborted", "AbortError")); }, { once: true });
      });
      const r = await fetch(`${base}/ask/${id}`, { cache: "no-store", signal });
      if (!r.ok) throw new Error(`ask job ${r.status}`);
      const j = await r.json();
      if (j.status === "done") return j;
    }
    throw new Error("the brain took too long");
  }

  return {
    get live() { return !!ctx.config.api; },
    async ask(q, { signal } = {}) {
      if (!ctx.config.api) return local(q);
      try {
        return await remote(q, signal);
      } catch (err) {
        if (signal?.aborted) throw err;
        const a = answerLocal(ctx, q);
        const text = `My live brain isn't answering, so here's what I remember. ${a.text}`;
        return { ...a, text, stream: once(text) };
      }
    },
  };
}

async function* once(text) { yield text; }

async function* readStream(body, sse) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let carry = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    if (!sse) { yield chunk; continue; }
    carry += chunk;
    const lines = carry.split("\n");
    carry = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).replace(/^ /, "");
      if (data === "[DONE]") return;
      yield data;
    }
  }
}
