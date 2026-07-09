import { generateText, isStepCount } from 'ai';
import { Credentials } from 'google-auth-library';
import { createModel } from './model';
import { gmailTool, calendarTool, submitEventsTool } from './tools';
import { EXTRACTION_PROMPT } from './prompts';
import { TimelineEntry } from '../store/history';

// Hard cap on search steps — prevents runaway loops and API cost blowout
const MAX_EXTRACTION_STEPS = 20;

// --- Extraction --------------------------------------------------------------

interface ExtractionInput {
  month: string;    // 'YYYY-MM'
  from: string;     // 'YYYY-MM-DD' first day to scan
  until: string;    // 'YYYY-MM-DD' last day to scan (inclusive)
  apiKey: string;
  token: Credentials;
}

/**
 * Runs the agent loop for one month. The model searches Gmail and Calendar
 * freely, then calls submitEvents with structured findings.
 * Returns the extracted timeline entries for that month.
 */
export async function runExtraction(input: ExtractionInput): Promise<TimelineEntry[]> {
  const model = createModel(input.apiKey);
  let extractedEvents: TimelineEntry[] = [];

  await generateText({
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

  return extractedEvents;
}

