import { generateText, isStepCount } from 'ai';
import { Credentials } from 'google-auth-library';
import { createModel } from './model';
import { gmailTool, calendarTool, submitEventsTool } from './tools';
import { EXTRACTION_PROMPT } from './prompts';
import { ScanUsage, toScanUsage } from './cost';
import { TimelineEntry } from '../store/history';

// Hard cap on search steps — prevents runaway loops and API cost blowout
const MAX_EXTRACTION_STEPS = 20;

/**
 * Prompt caching.
 *
 * This loop is unusually well suited to caching. Each step resends the entire
 * conversation so far, and that conversation grows fast: the system prompt
 * directs seven broad Gmail sweeps plus a domain search per company found, and
 * every one of those returns up to 200 messages of subject/from/date/snippet.
 * By the later steps, the bulk of each request is search results the model has
 * already been shown. Uncached, all of it is billed at the full input rate on
 * every single step.
 *
 * Setting cacheControl at the top level enables Anthropic's automatic caching,
 * which caches the longest stable prefix of the request rather than requiring
 * manual breakpoints. Since the prefix here (system prompt, tool definitions,
 * then the accumulated tool results) only ever grows and never changes, each
 * step reuses everything the previous step established.
 *
 * The 5 minute TTL is deliberate. Steps within a month run seconds apart, so
 * they land inside it comfortably. A 1 hour TTL would double the write premium
 * (2x base input instead of 1.25x) to buy cross-month reuse of only the system
 * prompt and tool schemas, which is a small fraction of the total.
 */
const CACHE_CONTROL = { type: 'ephemeral', ttl: '5m' } as const;

/**
 * Reasoning effort.
 *
 * `high` is Anthropic's current default, so setting it changes nothing today.
 * It is pinned because effort governs how many tool calls the model makes, and
 * this tool's accuracy depends directly on the model running enough follow-up
 * searches. If the default ever shifts, search depth and cost would move with
 * it, with no local change to explain the difference.
 *
 * Lowering this is not a cost optimization worth making: a cheaper scan that
 * searches less finds fewer applications, which defeats the point.
 *
 * Note that the SDK does not validate this against the model. An unsupported
 * value (`xhigh` is not available on Sonnet 4.6) is passed through without a
 * warning and fails at the API instead.
 */
const EFFORT = 'high' as const;

// --- Extraction --------------------------------------------------------------

interface ExtractionInput {
  month: string;    // 'YYYY-MM'
  from: string;     // 'YYYY-MM-DD' first day to scan
  until: string;    // 'YYYY-MM-DD' last day to scan (inclusive)
  apiKey: string;
  token: Credentials;
}

export interface ToolFailure {
  tool: string;
  message: string;
}

export interface ExtractionResult {
  events: TimelineEntry[];
  usage: ScanUsage;
  /**
   * Tool calls that threw. The AI SDK does not surface these as exceptions: it
   * feeds the error back to the model as a tool result and the run completes
   * normally. Left unreported, a scan where every Gmail call failed is
   * indistinguishable from a scan of an empty inbox. The caller must check this.
   */
  toolErrors: ToolFailure[];
}

/** Pulls tool-error parts out of every step of a completed run. */
function collectToolErrors(steps: readonly { content: readonly unknown[] }[]): ToolFailure[] {
  const failures: ToolFailure[] = [];

  for (const step of steps) {
    for (const part of step.content) {
      const p = part as { type?: string; toolName?: string; error?: unknown };
      if (p.type !== 'tool-error') continue;

      const message =
        p.error instanceof Error
          ? p.error.message
          : typeof p.error === 'string'
            ? p.error
            : JSON.stringify(p.error);

      failures.push({ tool: p.toolName ?? 'unknown', message });
    }
  }

  return failures;
}

/**
 * Runs the agent loop for one month. The model searches Gmail and Calendar
 * freely, then calls submitEvents with structured findings.
 * Returns the extracted timeline entries for that month plus token usage.
 */
export async function runExtraction(input: ExtractionInput): Promise<ExtractionResult> {
  const model = createModel(input.apiKey);
  let extractedEvents: TimelineEntry[] = [];

  const result = await generateText({
    model,
    system: EXTRACTION_PROMPT,
    prompt: `Extract all job application events for ${input.month} (${input.from} to ${input.until}).`,
    tools: {
      searchGmail: gmailTool(input.token, input.from, input.until),
      searchCalendar: calendarTool(input.token, input.from, input.until),
      submitEvents: submitEventsTool((events) => {
        extractedEvents = events;
      }),
    },
    providerOptions: {
      anthropic: { cacheControl: CACHE_CONTROL, effort: EFFORT },
    },
    stopWhen: isStepCount(MAX_EXTRACTION_STEPS),
    onStepEnd({ stepNumber, toolCalls }) {
      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          if (call.toolName === 'submitEvents') {
            console.log(`  [${stepNumber}] submitEvents — ${extractedEvents.length} event(s) found`);
          } else {
            console.log(`  [${stepNumber}] ${call.toolName} ${JSON.stringify(call.input)}`);
          }
        }
      }
    },
  });

  // `usage` is already aggregated across every step of the loop.
  return {
    events: extractedEvents,
    usage: toScanUsage(result.usage),
    toolErrors: collectToolErrors(result.steps),
  };
}

