import { loadReport, getAllEvents } from '../store/history';
import { printTimeline } from './scan';

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

}
