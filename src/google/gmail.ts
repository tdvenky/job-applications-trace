import { google } from 'googleapis';
import { Credentials } from 'google-auth-library';
import { createOAuth2Client } from './auth';

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

/**
 * Searches the user's Gmail inbox.
 * Restricted to inbox only (not spam/trash) and messages on or after `since`.
 */
export async function searchInbox(
  token: Credentials,
  query: string,
  since: string,
  until: string
): Promise<GmailMessage[]> {
  const auth = await createOAuth2Client();
  auth.setCredentials(token);

  const gmail = google.gmail({ version: 'v1', auth });

  // Strip any 'in:' operators from the model-supplied query. The inbox restriction is
  // enforced by the hardcoded 'in:inbox' prefix below and must not be overridable by
  // a prompt-injected query attempting to widen scope (e.g. 'OR in:sent').
  const sanitizedQuery = query.replace(/\bin:\S*/gi, '').trim();

  // `in:inbox` keeps us out of spam/trash; after:/before: enforce the date range
  const fullQuery = `in:inbox after:${since.replace(/-/g, '/')} before:${until.replace(/-/g, '/')} ${sanitizedQuery}`;

  // Paginate through results up to MAX_MESSAGES to avoid runaway API calls.
  // Each message requires a separate detail fetch (N+1), so we cap total results.
  const MAX_MESSAGES = 200;
  const PAGE_SIZE = 50;
  const messages: { id?: string | null }[] = [];
  let pageToken: string | undefined;

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: fullQuery,
      maxResults: PAGE_SIZE,
      pageToken,
    });

    messages.push(...(listRes.data.messages ?? []));
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken && messages.length < MAX_MESSAGES);

  const detailed = await Promise.all(
    messages.slice(0, MAX_MESSAGES).map(async (m) => {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });
      const headers = res.data.payload?.headers ?? [];
      const get = (name: string) => headers.find((h) => h.name === name)?.value ?? '';
      return {
        id: m.id ?? '',
        subject: get('Subject'),
        from: get('From'),
        date: get('Date'),
        snippet: res.data.snippet ?? '',
      };
    })
  );

  return detailed;
}
