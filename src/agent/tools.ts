import { tool } from 'ai';
import { z } from 'zod';
import { searchInbox } from '../google/gmail';
import { listEvents } from '../google/calendar';
import { TimelineEntry } from '../store/history';
import { Credentials } from 'google-auth-library';

/**
 * Gives the model the ability to search Gmail.
 * Restricted to inbox only, within the from/until date range.
 */
export function gmailTool(token: Credentials, from: string, until: string) {
  return tool({
    description:
      'Search the Gmail inbox for job application emails. ' +
      'Only searches the inbox (not spam or trash). ' +
      'Only returns messages within the scan date range. ' +
      'Use Gmail search syntax: from:, subject:, etc.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Gmail search query. Examples: "subject:interview", "from:@company.com", "application received"'
        ),
    }),
    execute: async ({ query }) => {
      const results = await searchInbox(token, query, from, until);
      if (results.length === 0) return 'No messages found.';
      return results
        .map((m) => `[${m.date}] From: ${m.from}\nSubject: ${m.subject}\nSnippet: ${m.snippet}`)
        .join('\n\n');
    },
  });
}

/**
 * Gives the model the ability to read Google Calendar.
 * Restricted to events within the from/until date range.
 */
export function calendarTool(token: Credentials, from: string, until: string) {
  return tool({
    description:
      'Search Google Calendar for events related to job applications within the scan date range. ' +
      'Use this to find interviews, phone screens, and hiring calls.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Search term to filter calendar events. Examples: "interview", "technical screen", "hiring"'
        ),
    }),
    execute: async ({ query }) => {
      const events = await listEvents(token, query, from, until);
      if (events.length === 0) return 'No calendar events found.';

      // Cap description length before passing to the model context
      return events
        .map(
          (e) =>
            `[${e.start}] ${e.summary}` +
            (e.description ? '\nDetails: ' + e.description.slice(0, 200) : '')
        )
        .join('\n\n');
    },
  });
}

/**
 * Terminal tool: the model calls this exactly once when finished searching.
 * The callback stores results so the caller can read them after the loop ends.
 */
export function submitEventsTool(onSubmit: (events: TimelineEntry[]) => void) {
  return tool({
    description:
      'Submit all job application events you found. ' +
      'Call this exactly once after completing all searches. ' +
      'Pass an empty array if you found no events.',
    inputSchema: z.object({
      events: z.array(
        z.object({
          company: z.string().describe('Company name'),
          domain: z.string().optional().describe('Email domain, e.g. acme.com'),
          date: z.string().describe('Event date in YYYY-MM-DD format'),
          event: z.string().describe('Brief description of what happened'),
        })
      ),
    }),
    execute: async ({ events }) => {
      onSubmit(events as TimelineEntry[]);
      return `Received ${events.length} event(s).`;
    },
  });
}
