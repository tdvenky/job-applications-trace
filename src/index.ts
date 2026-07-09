#!/usr/bin/env node
import { Command } from 'commander';
import { runAuth } from './commands/auth';
import { runScan } from './commands/scan';
import { runHistory } from './commands/history';

const program = new Command();

program
  .name('job-applications-trace')
  .description('AI agent that reconstructs your job search from Gmail and Calendar')
  .version('0.1.0');

program
  .command('auth')
  .description('Authenticate with Google (run this once before scanning)')
  .action(runAuth);

program
  .command('scan')
  .description('Scan your inbox and calendar for job application activity')
  .requiredOption('--month <month>', 'Month to scan in YYYY-MM format (e.g. --month 2025-01)')
  .action(runScan);

program
  .command('history')
  .description('Show past scan diagnoses without rescanning')
  .action(runHistory);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
