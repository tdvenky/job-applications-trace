import { resolveApiKey } from '../config';
import { loadToken } from '../google/auth';
import { runExtraction } from '../agent/loop';
import {
  loadReport,
  saveReport,
  createReport,
  upsertMonthData,
  getAllEvents,
  TimelineEntry,
} from '../store/history';

interface ScanOptions {
  month: string; // YYYY-MM
}

// ---------------------------------------------------------------------------
// Timeline formatting
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

/** True if this event represents a new application (vs. a follow-up). */
function isApplication(event: string): boolean {
  const t = event.trim().toLowerCase();
  return t.startsWith('applied') || /\band applied\b/.test(t);
}

interface Thread {
  company: string;
  appliedDate: string;
  appliedEvent: string;
  followups: TimelineEntry[];
}

/**
 * Build application threads from a flat event list.
 * Each "Applied" event starts a new thread; subsequent events for the same
 * company attach as follow-ups to the most recent thread for that company.
 * Events that arrive before any application for a company (e.g. pure recruiter
 * outreach) are treated as the thread header themselves.
 */
function buildThreads(events: TimelineEntry[]): Thread[] {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const companyThreads = new Map<string, Thread[]>();
  const allThreads: Thread[] = [];

  for (const e of sorted) {
    const threads = companyThreads.get(e.company) ?? [];

    if (isApplication(e.event) || threads.length === 0) {
      // Start a new thread
      const thread: Thread = {
        company: e.company,
        appliedDate: e.date,
        appliedEvent: e.event,
        followups: [],
      };
      threads.push(thread);
      companyThreads.set(e.company, threads);
      allThreads.push(thread);
    } else {
      // Attach to the most recent thread for this company
      threads[threads.length - 1].followups.push(e);
    }
  }

  return allThreads;
}

export function printTimeline(events: TimelineEntry[]): void {
  if (events.length === 0) return;

  const threads = buildThreads(events);

  // Group threads by their application date
  const dateOrder: string[] = [];
  // Group threads by month, then by date within each month
  const monthOrder: string[] = [];
  const byMonth = new Map<string, Map<string, Thread[]>>();
  for (const t of threads) {
    const mon = t.appliedDate.slice(0, 7); // YYYY-MM
    if (!byMonth.has(mon)) {
      byMonth.set(mon, new Map());
      monthOrder.push(mon);
    }
    const byDate = byMonth.get(mon)!;
    if (!byDate.has(t.appliedDate)) byDate.set(t.appliedDate, []);
    byDate.get(t.appliedDate)!.push(t);
  }

  let totalApps = 0;
  for (const mon of monthOrder) {
    const [y, m] = mon.split('-').map(Number);
    console.log(`\n=== ${MONTH_NAMES[m - 1]} ${y} ===`);

    const byDate = byMonth.get(mon)!;
    let itemNum = 0;
    for (const [date, dateThreads] of byDate) {
      console.log(`\n${formatDate(date)}`);
      for (const thread of dateThreads) {
        itemNum++;
        console.log(`\t${itemNum}. ${thread.company} — ${thread.appliedEvent}`);
        thread.followups.forEach((f, i) => {
          console.log(`\t\t${i + 1}. ${formatDate(f.date)} — ${f.event}`);
        });
      }
    }

    totalApps += itemNum;
    console.log(`\n(${itemNum} application${itemNum === 1 ? '' : 's'} in ${MONTH_NAMES[m - 1]} ${y})`);
  }

  console.log(`\nTotal: ${totalApps} application${totalApps === 1 ? '' : 's'} across ${monthOrder.length} month${monthOrder.length === 1 ? '' : 's'}`);
}

// ---------------------------------------------------------------------------
// Scan command
// ---------------------------------------------------------------------------

export async function runScan(options: ScanOptions): Promise<void> {
  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(options.month)) {
    console.error('Error: --month must be in YYYY-MM format (e.g. --month 2025-01)');
    process.exit(1);
  }

  const [year, month] = options.month.split('-').map(Number);
  const from = `${options.month}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // last day of the month
  const monthEnd = `${options.month}-${String(lastDay).padStart(2, '0')}`;

  // For the current month, scan up to today; for past months, scan to month end
  const today = new Date().toISOString().slice(0, 10);
  const until = today < monthEnd ? today : monthEnd;

  // Pre-flight: check auth token
  const token = await loadToken();
  if (!token) {
    console.error('No auth token found. Run `job-applications-trace auth` first.');
    process.exit(1);
  }

  let report = (await loadReport()) ?? createReport();
  const apiKey = await resolveApiKey();

  console.log(`\nScanning ${options.month} (${from} to ${until})...`);
  console.log('Agent search log:');

  const events = await runExtraction({ month: options.month, from, until, apiKey, token });

  report = upsertMonthData(report, options.month, from, until, events);
  await saveReport(report);

  console.log(`\nFound ${events.length} event(s).\n`);

  const allEvents = getAllEvents(report);

  console.log('Timeline:');
  console.log('-'.repeat(70));
  printTimeline(allEvents);
  console.log('-'.repeat(70));
}
