import * as fs from 'fs/promises';
import * as path from 'path';
import { HISTORY_DIR } from '../constants';

// --- Types -------------------------------------------------------------------

export interface TimelineEntry {
  company: string;
  domain?: string;
  date: string;   // YYYY-MM-DD
  event: string;
}

export interface MonthData {
  scannedFrom: string;   // YYYY-MM-DD (first day of the month)
  scannedUntil: string;  // YYYY-MM-DD (date of the most recent scan for this month)
  events: TimelineEntry[];
}

export interface Report {
  version: '1';
  createdAt: string;
  updatedAt: string;
  months: Record<string, MonthData>; // key: 'YYYY-MM'
}

// --- Paths -------------------------------------------------------------------

const REPORT_PATH = path.join(HISTORY_DIR, 'report.json');

// --- CRUD --------------------------------------------------------------------

export async function loadReport(): Promise<Report | null> {
  try {
    const raw = await fs.readFile(REPORT_PATH, 'utf-8');
    return JSON.parse(raw) as Report;
  } catch {
    return null;
  }
}

export async function saveReport(report: Report): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
}

export function createReport(): Report {
  const now = new Date().toISOString();
  return {
    version: '1',
    createdAt: now,
    updatedAt: now,
    months: {},
  };
}

export function upsertMonthData(
  report: Report,
  month: string,
  from: string,
  until: string,
  events: TimelineEntry[]
): Report {
  return {
    ...report,
    updatedAt: new Date().toISOString(),
    months: {
      ...report.months,
      [month]: { scannedFrom: from, scannedUntil: until, events },
    },
  };
}

export function getAllEvents(report: Report): TimelineEntry[] {
  return Object.values(report.months).flatMap((m) => m.events);
}
