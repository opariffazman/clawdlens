import type { Usage } from "./types";

const DEFAULT_LIMIT = 200_000;
const MILLION = 1_000_000;

export function contextLimit(model: string): number {
  if (!model) return DEFAULT_LIMIT;
  if (/\[1m\]|-1m\b|\b1m\b/i.test(model)) return MILLION;
  return DEFAULT_LIMIT;
}

// The transcript's `message.model` field does not encode the [1m] variant, so a
// session whose observed context exceeds the standard window must be on a
// larger one. Infer it from the data so the gauge never reads above 100%.
export function effectiveContextLimit(model: string, contextTokens: number): number {
  const base = contextLimit(model);
  return contextTokens > base ? MILLION : base;
}

// USD per million tokens. Approximate; labeled as estimate in the UI.
interface Price { in: number; out: number; cacheRead: number; cacheWrite: number }
const PRICES: { match: RegExp; price: Price }[] = [
  { match: /opus/i,   price: { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 } },
  { match: /sonnet/i, price: { in: 3,  out: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: /haiku/i,  price: { in: 1,  out: 5,  cacheRead: 0.1, cacheWrite: 1.25 } },
];

export function priceFor(model: string): Price {
  for (const p of PRICES) if (p.match.test(model)) return p.price;
  return PRICES[0]!.price; // default to opus
}

export interface TokenTotals { input: number; output: number; cacheRead: number; cacheCreate: number }

export function addUsage(t: TokenTotals, u: Usage | undefined): TokenTotals {
  if (!u) return t;
  return {
    input: t.input + (u.input_tokens ?? 0),
    output: t.output + (u.output_tokens ?? 0),
    cacheRead: t.cacheRead + (u.cache_read_input_tokens ?? 0),
    cacheCreate: t.cacheCreate + (u.cache_creation_input_tokens ?? 0),
  };
}

export function contextTokens(u: Usage | undefined): number {
  if (!u) return 0;
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

// rough tokenizer-free estimate (~4 chars/token) for context-pool attribution
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCostUSD(t: TokenTotals, model: string): number {
  const p = priceFor(model);
  return (t.input * p.in + t.output * p.out + t.cacheRead * p.cacheRead + t.cacheCreate * p.cacheWrite) / MILLION;
}
