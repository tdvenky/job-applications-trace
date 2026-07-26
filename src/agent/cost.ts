/**
 * Token accounting and cost estimation.
 *
 * The point of this module is to make the cost of a scan observable. Without it
 * the only way to know what a scan cost is to read the Anthropic console after
 * the fact, which cannot be attributed to a specific month or model.
 */

// --- Types -------------------------------------------------------------------

export interface ScanUsage {
  /** Input tokens that were neither read from nor written to the cache. */
  noCacheTokens: number;
  /** Input tokens served from the prompt cache at a large discount. */
  cacheReadTokens: number;
  /** Input tokens written into the prompt cache at a small premium. */
  cacheWriteTokens: number;
  /** Output (completion) tokens. */
  outputTokens: number;
}

export const EMPTY_USAGE: ScanUsage = {
  noCacheTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

// --- Pricing -----------------------------------------------------------------

interface ModelPricing {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/**
 * USD per million tokens, as of July 2026.
 *
 * These are hardcoded so the CLI can print a cost estimate without an extra
 * network call. They will drift when Anthropic changes pricing, so the printed
 * figure is labelled an estimate and the console remains the source of truth.
 */
const PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * Cache write costs 1.25x the base input rate for the default 5 minute TTL.
 * (A 1 hour TTL would be 2x, which this tool does not use.)
 */
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Cache reads cost 10% of the base input rate. This is where the savings come from. */
const CACHE_READ_MULTIPLIER = 0.1;

// --- Aggregation -------------------------------------------------------------

/**
 * Normalises the AI SDK usage object into our own shape.
 * Every field is optional upstream, so missing values are treated as zero.
 */
export function toScanUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}): ScanUsage {
  const details = usage.inputTokenDetails ?? {};
  const cacheRead = details.cacheReadTokens ?? 0;
  const cacheWrite = details.cacheWriteTokens ?? 0;

  // Prefer the explicit non-cached count. Fall back to deriving it from the
  // total so the numbers still add up on providers that omit the breakdown.
  const noCache =
    details.noCacheTokens ?? Math.max((usage.inputTokens ?? 0) - cacheRead - cacheWrite, 0);

  return {
    noCacheTokens: noCache,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: usage.outputTokens ?? 0,
  };
}

export function addUsage(a: ScanUsage, b: ScanUsage): ScanUsage {
  return {
    noCacheTokens: a.noCacheTokens + b.noCacheTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

// --- Cost --------------------------------------------------------------------

/**
 * Estimated USD cost for a given usage total on a given model.
 * Returns null for models with no pricing entry rather than guessing.
 */
export function estimateCost(usage: ScanUsage, modelId: string): number | null {
  const price = PRICING[modelId];
  if (!price) return null;

  const perToken = price.input / 1_000_000;
  return (
    usage.noCacheTokens * perToken +
    usage.cacheWriteTokens * perToken * CACHE_WRITE_MULTIPLIER +
    usage.cacheReadTokens * perToken * CACHE_READ_MULTIPLIER +
    usage.outputTokens * (price.output / 1_000_000)
  );
}

/**
 * What this usage would have cost with caching disabled, i.e. if every cached
 * token had been billed at the full input rate. Used to show the saving.
 */
export function estimateUncachedCost(usage: ScanUsage, modelId: string): number | null {
  const price = PRICING[modelId];
  if (!price) return null;

  const allInput = usage.noCacheTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  return allInput * (price.input / 1_000_000) + usage.outputTokens * (price.output / 1_000_000);
}

// --- Formatting --------------------------------------------------------------

function formatUsd(amount: number): string {
  // Scans are cheap enough that two decimal places rounds most of them to $0.00.
  return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}

function formatTokens(n: number): string {
  return n.toLocaleString('en-US');
}

/** Prints a token and cost breakdown for a completed scan. */
export function printUsage(usage: ScanUsage, modelId: string): void {
  const totalInput = usage.noCacheTokens + usage.cacheReadTokens + usage.cacheWriteTokens;

  const label = (s: string) => `  ${s.padEnd(21)}`;

  console.log(`\nTokens (${modelId}):`);
  console.log(`${label('Input (uncached):')}${formatTokens(usage.noCacheTokens)}`);
  console.log(`${label('Input (cache write):')}${formatTokens(usage.cacheWriteTokens)}`);
  console.log(`${label('Input (cache read):')}${formatTokens(usage.cacheReadTokens)}`);
  console.log(`${label('Output:')}${formatTokens(usage.outputTokens)}`);

  if (totalInput > 0) {
    const hitRate = (usage.cacheReadTokens / totalInput) * 100;
    console.log(`${label('Cache hit rate:')}${hitRate.toFixed(1)}% of input tokens`);
  }

  if (usage.cacheReadTokens === 0 && usage.cacheWriteTokens === 0) {
    console.log('\n  Note: no cache activity recorded. Prompt caching did not engage.');
  }

  const cost = estimateCost(usage, modelId);
  const uncached = estimateUncachedCost(usage, modelId);

  if (cost === null || uncached === null) {
    console.log(`\n  No pricing on record for ${modelId}, skipping cost estimate.`);
    return;
  }

  console.log(`\n${label('Estimated cost:')}${formatUsd(cost)}`);

  if (usage.cacheReadTokens > 0) {
    const saved = uncached - cost;
    const pct = uncached > 0 ? (saved / uncached) * 100 : 0;
    console.log(`${label('Without caching:')}${formatUsd(uncached)}`);
    console.log(`${label('Saved by caching:')}${formatUsd(saved)} (${pct.toFixed(0)}%)`);
  }

  console.log('  (estimate only, based on July 2026 list pricing)');
}
