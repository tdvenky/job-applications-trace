import { loadReport, getAllEvents, Report } from '../store/history';
import { printTimeline } from './scan';
import { EMPTY_USAGE, addUsage, printUsage } from '../agent/cost';

export async function runHistory(): Promise<void> {
  const report = await loadReport();

  if (!report) {
    console.log('No report yet. Run `job-applications-trace scan --month YYYY-MM` to get started.');
    return;
  }

  // Show which months have been scanned
  const months = Object.entries(report.months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => `  ${month}  (scanned up to ${data.scannedUntil}, ${data.events.length} event(s))`)
    .join('\n');

  console.log(`Months scanned:\n${months}`);

  const allEvents = getAllEvents(report);
  if (allEvents.length > 0) {
    console.log('\nTimeline:');
    console.log('-'.repeat(70));
    printTimeline(allEvents);
    console.log('-'.repeat(70));
  }

  printTotalUsage(report.months);
}

/**
 * Totals token usage across every scanned month.
 *
 * Months are scanned one command at a time, so this is the only place a
 * multi-month total is visible. Months recorded before usage tracking existed
 * carry no usage and are excluded, with a note so the total is not mistaken
 * for the full picture.
 */
function printTotalUsage(months: Report['months']): void {
  const entries = Object.values(months);
  const withUsage = entries.filter((m) => m.usage);
  if (withUsage.length === 0) return;

  const models = new Set(withUsage.map((m) => m.model ?? 'unknown'));
  const total = withUsage.reduce((acc, m) => addUsage(acc, m.usage!), EMPTY_USAGE);

  console.log(`\nTotals across ${withUsage.length} month(s):`);

  if (models.size > 1) {
    // Mixed models cannot share one cost estimate, so report tokens only.
    console.log(`  Mixed models (${[...models].join(', ')}), skipping combined cost estimate.`);
    console.log(`  Input tokens:  ${(total.noCacheTokens + total.cacheReadTokens + total.cacheWriteTokens).toLocaleString('en-US')}`);
    console.log(`  Output tokens: ${total.outputTokens.toLocaleString('en-US')}`);
  } else {
    printUsage(total, [...models][0]);
  }

  const missing = entries.length - withUsage.length;
  if (missing > 0) {
    console.log(`\n  (${missing} month(s) scanned before usage tracking, not counted above)`);
  }
}
