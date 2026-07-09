import { google, calendar_v3 } from 'googleapis';
import { Credentials } from 'google-auth-library';
import { createOAuth2Client } from './auth';

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
}

/**
 * Lists Google Calendar events matching `query` on or after `since`.
 */
export async function listEvents(
  token: Credentials,
  query: string,
  since: string,
  until: string
): Promise<CalendarEvent[]> {
  const auth = await createOAuth2Client();
  auth.setCredentials(token);

  const calendar = google.calendar({ version: 'v3', auth });

  const MAX_EVENTS = 200;
  const PAGE_SIZE = 50;
  const allEvents: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(since).toISOString(),
      timeMax: new Date(until).toISOString(),
      q: query,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: PAGE_SIZE,
      pageToken,
    });

    allEvents.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && allEvents.length < MAX_EVENTS);

  return allEvents.slice(0, MAX_EVENTS).map((e) => ({
    id: e.id ?? '',
    summary: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    description: e.description?.slice(0, 500),
  }));
}
