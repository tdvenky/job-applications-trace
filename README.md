# job-applications-trace

An AI agent that reads your Gmail inbox and Google Calendar and reconstructs your job search activity: jobs you applied to, follow-ups, and interviews, organized into a timeline. No manual tracking, no spreadsheet.

It is a real agent, not a fixed workflow: there is no procedural code deciding what happens next. The model runs a structured first pass across Gmail and Calendar (broad sweeps for applications, recruiter outreach, interviews, rejections, and offers), then decides for itself which companies are worth digging into and issues its own follow-up searches per company, and decides when it has enough signal to stop, all within a hard cap of 20 tool-call iterations.

## What it does

- Searches your Gmail inbox (never spam, trash, or other folders) and Google Calendar for a month you specify
- Lets the model decide which companies to investigate further and how many follow-up searches to run, and when it has enough information
- Prints a live log of the agent's search decisions as it works
- Produces a timeline grouping each application with its follow-ups (recruiter screens, interviews, rejections, offers etc.)
- Stores scan history locally so you can revisit past results without rescanning

## What it does not do

- No company research or web search
- No automatically drafted messages
- No automatically created tasks or calendar events
- **Strictly read-only: it never sends email or creates/modifies calendar events**

## Requirements

- Node.js 18 or later
- A Google account with Gmail and Calendar
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

## Install

```bash
npm install -g job-applications-trace
```

Or run without installing:

```bash
npx job-applications-trace <command>
```

## Setup

### 1. Authenticate with Google

```bash
job-applications-trace auth
```

The first time you run this, you'll need a Google OAuth client (one-time setup, a few minutes). This is free: creating a Google Cloud project and enabling these APIs does not require a billing account.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a project, then enable the **Gmail API** and **Google Calendar API**
3. Go to **APIs & Services -> Google Auth Platform** (the OAuth consent screen) and configure it for **External** users
4. Under **Audience**, add your own Google account under **Test users**. New OAuth apps start in "Testing" status, and only accounts on this list can sign in, everyone else gets an access-blocked error
5. Go to **Clients -> Create Client**, choose **Desktop app** as the application type
6. Under **Authorized redirect URIs**, add `http://localhost:3000/oauth2callback`
7. Copy the Client ID and Client Secret when prompted by the CLI

The tool then opens your browser for the standard Google consent screen. Because the app is unverified, Google will show a warning; click **Advanced -> Go to (app name)** to proceed, this is expected for a personal-use tool like this one. The resulting token is saved locally.

Note on re-authentication: this tool currently requests an online (not offline) access token, so no refresh token is stored, only a short-lived access token that expires roughly every hour. This is a deliberate trade-off for now: it avoids persisting a long-lived refresh token on disk, which would be a bigger liability if your machine were compromised. The plan is to move to offline access with a refresh token in a future version, at which point re-auth will only be needed roughly every 7 days (Google's cap for unverified apps in "Testing" status). Until then, if `scan` or `history` fails with an auth error, just re-run `job-applications-trace auth`.

### 2. Provide an Anthropic API key

If you don't already have one:

1. Go to [console.anthropic.com](https://console.anthropic.com/) and sign up or log in
2. Go to **Settings -> API Keys** and create a new key
3. Go to **Settings -> Billing** and add credit. Anthropic requires a small prepaid balance before a key will work, with a $5 minimum top-up (check the console for the current figure)

This is separate from any Claude subscription you may already have. A Claude Pro or Max plan does not cover API usage.

## What a scan costs

The honest version: the minimum top-up is the real cost of entry, not the scanning.

Cost is driven by how many jobs you applied to in the month being scanned, not by the number of months. A quiet month costs a few cents. A month with fifty applications costs about five times that, because the agent identifies more companies and runs a follow-up search for each one.

Measured over six consecutive months on the author's own inbox, which is kept clear of junk and promotional email, on `claude-sonnet-4-6` with caching enabled:

| Month | Applications found | Cost |
|---|---|---|
| 1 | 9 | $0.08 |
| 2 | 11 | $0.07 |
| 3 | 46 | $0.32 |
| 4 | 50 | $0.40 |
| 5 | 29 | $0.21 |
| 6 | 26 | $0.30 |
| **Total** | **171** | **$1.39** |

Six months of history, 171 applications reconstructed, for under a dollar and a half.

Note that months 5 and 6 break the pattern: month 6 found fewer applications than month 5 but cost more. Cost follows how many searches the agent decides to run, which correlates with application count but isn't determined by it.

Two caveats worth stating plainly:

- **An inbox that isn't cleared of junk and promotional email will cost more.** The agent opens with broad sweeps for ordinary phrases like "offer", "next steps" and "unfortunately", which marketing email matches just as readily as a recruiter does. Those sweeps return more to read, and the model pays to read it. The follow-up searches, which target a specific company's domain, are unaffected. Each search is capped at 200 messages, so this inflates cost rather than causing it to run away.
- **Cost varies between runs of the same month.** This is an agent, not a fixed script: it decides how many follow-up searches to run, and that decision is not identical every time. Treat these as a range, not a guarantee.

Funding the $5 minimum should comfortably cover scanning a year of history. You are not going to burn through it in a single run.

Every scan prints its own token usage and a cost estimate when it finishes, and `history` totals it across all scanned months, so you never have to guess or reconcile against the console after the fact. These estimates have been checked against actual console billing and matched to the cent.

### Prompt caching

This tool uses Anthropic's prompt caching, and it is worth explaining why, because the reason is specific to how an agent loop works rather than a generic optimization.

An agent is not one API call. It is a loop, and every iteration resends the entire conversation so far. This loop runs seven broad Gmail and Calendar sweeps, then a follow-up search for each company it identifies, which on a busy month can be forty or more. By the later iterations, most of each request is search results the model has already been shown. Without caching, every one of those tokens is billed again at the full input rate on every step.

Prompt caching lets the provider recognise that the leading portion of a request is identical to one it just processed and serve it from cache. Cached reads are billed at 10% of the normal input rate; writing to the cache costs a 25% premium once.

Two implementation details:

- **Automatic caching rather than manual breakpoints.** Anthropic caches the longest stable prefix of the request on its own, so the cached region grows with the conversation rather than being pinned to the system prompt.
- **A 5 minute cache lifetime, not 1 hour.** Steps within a scan run seconds apart and fit inside the 5 minute window comfortably. The 1 hour option doubles the write premium to buy cross-month reuse of only the system prompt and tool definitions, a small fraction of the total. Not worth it here.

### What caching actually saved, and why it's less than advertised

Across the same six months: **$1.39 with caching against $1.96 without, a 29% saving.** Anthropic's console suggests most organizations see input costs drop 50 to 90%. This workload doesn't, and the reason is worth understanding before you assume caching will transform your bill.

Per-month savings ranged from 8% to 45%, tracking one variable almost exactly: the ratio of cached tokens read to cached tokens written.

| Month | Cache read / write ratio | Saved |
|---|---|---|
| 2 | 3.29 | 45% |
| 3 | 1.81 | 39% |
| 1 | 2.26 | 36% |
| 4 | 1.18 | 30% |
| 5 | 0.85 | 19% |
| 6 | 0.46 | 8% |

A cached token costs 1.25x to write and 0.1x per read, so it only pays off if it gets re-read. Break-even arrives fast: read twice saves 32%, three times 52%, five times 67%. But these scans finish in three to five steps, and the agent batches many searches into a single step. Content pulled in during the first step gets re-read several times and saves well. Content pulled in during step three gets read once and barely covers its own write premium.

The counterintuitive consequence: **parallel tool calls hurt caching.** They are faster and use fewer round trips, but they mean context arrives late and is re-read fewer times. A deeper, more sequential loop would cache better while running slower. This tool favours the faster loop and accepts the smaller discount.

To see the effect on your own inbox, check the `Saved by caching` line printed at the end of each scan.

## Why Sonnet and not a cheaper model

`claude-sonnet-4-6` is the default. Haiku is roughly a third of the price per token, so it's a fair question why the tool doesn't use it.

It was tested on the same inbox and the same months:

| | Sonnet | Haiku |
|---|---|---|
| Quiet month, applications found | 9 | 8 |
| Busy month, applications found | 50 | 33 |
| Busy month, follow-up searches run | ~48 | 29 |
| Busy month, cost | $0.40 | $0.07 |

Haiku is cheaper largely because it does less work. On a quiet month the difference is marginal. On a busy month it ran a third fewer follow-up searches and missed 17 applications, roughly a third of the month.

That trade doesn't make sense here. The saving over six months would be around a dollar, while the cost is missing a third of your results in exactly the months where you applied to the most places and most need an accurate picture.

Two smaller findings from the same comparison:

- **Haiku caches worse.** Anthropic sets a higher minimum cacheable prefix for Haiku models, so short early requests don't cache at all even with `cache_control` set. One Haiku scan showed over 9,000 uncached input tokens where the equivalent Sonnet scan showed 7.
- **Effort is left at its default.** Anthropic's `effort` parameter defaults to `high` and directly influences how many tool calls the model makes. Lowering it would cut cost by searching less, which is the opposite of what this tool needs.

The CLI checks for a key in this order, first match wins:

1. `JOB_APPLICATIONS_TRACE_API_KEY` environment variable
2. `ANTHROPIC_API_KEY` environment variable (convenience fallback)
3. Saved config file (see below)
4. If none of the above, the CLI prompts once and saves your key for future runs

## Usage

Scan a month:

```bash
job-applications-trace scan --month 2026-01
```

Review past scans without rescanning:

```bash
job-applications-trace history
```

## Sample output

Scanning one month. The first several searches are a structured sweep (applications, recruiter outreach, interviews, rejections, offers); the model then decides on its own which companies to dig into, here identifying three and issuing one follow-up search per company before deciding it has enough and submitting:

```
$ job-applications-trace scan --month 2026-01

Scanning 2026-01 (2026-01-01 to 2026-01-31)...
Model: claude-sonnet-4-6
Agent search log:
  [1] searchGmail {"query":"\"application received\" OR \"thank you for applying\" OR \"we received your application\""}
  [2] searchGmail {"query":"\"recruiter\" OR \"talent acquisition\" OR \"I came across your profile\""}
  [3] searchGmail {"query":"\"interview\" OR \"technical screen\" OR \"phone screen\" OR \"hiring manager\""}
  [4] searchGmail {"query":"\"unfortunately\" OR \"other candidates\" OR \"not moving forward\" OR \"not selected\""}
  [5] searchGmail {"query":"\"offer\" OR \"compensation\" OR \"start date\""}
  [6] searchGmail {"query":"\"next steps\" OR \"moving forward\""}
  [7] searchCalendar {"query":"interview OR screen OR hiring"}
  [8] searchGmail {"query":"from:@acme.com"}
  [9] searchGmail {"query":"from:@globex.com"}
  [10] searchGmail {"query":"from:@initech.io"}
  [11] submitEvents — 5 event(s) found

Found 5 event(s).

Tokens (claude-sonnet-4-6):
  Input (uncached):    20,000
  Input (cache write): 60,000
  Input (cache read):  900,000
  Output:              8,000
  Cache hit rate:      91.8% of input tokens

  Estimated cost:      $0.67
  Without caching:     $3.06
  Saved by caching:    $2.39 (78%)
  (estimate only, based on July 2026 list pricing)

Timeline:
----------------------------------------------------------------------

=== Jan 2026 ===

Jan 6, 2026
	1. Acme Corp — Applied for Senior Backend Engineer
		1. Jan 20, 2026 — Phone screen completed
	2. Globex Inc — Applied for Engineering Manager

Jan 9, 2026
	3. Initech — Applied for Staff Software Engineer
		1. Jan 14, 2026 — Recruiter screen scheduled

(3 applications in Jan 2026)

Total: 3 applications across 1 month
----------------------------------------------------------------------
```

The token and cost block above uses placeholder figures for illustration.

After scanning a second month, `history` shows the combined timeline without rescanning:

```
$ job-applications-trace history

Months scanned:
  2026-01  (scanned up to 2026-01-31, 5 event(s))
  2026-02  (scanned up to 2026-02-28, 4 event(s))

Timeline:
----------------------------------------------------------------------

=== Jan 2026 ===

Jan 6, 2026
	1. Acme Corp — Applied for Senior Backend Engineer
		1. Jan 20, 2026 — Phone screen completed
	2. Globex Inc — Applied for Engineering Manager

Jan 9, 2026
	3. Initech — Applied for Staff Software Engineer
		1. Jan 14, 2026 — Recruiter screen scheduled

(3 applications in Jan 2026)

=== Feb 2026 ===

Feb 3, 2026
	1. Vandelay Industries — Applied for Product Manager
		1. Feb 25, 2026 — Rejected
	2. Wayne Enterprises — Applied for Site Reliability Engineer
		1. Feb 18, 2026 — Onsite interview completed

(2 applications in Feb 2026)

Total: 5 applications across 2 months
----------------------------------------------------------------------
```

Company names and roles above are illustrative, not real data.

## Where things are stored

Everything lives in `~/.job-applications-trace/`, in your home directory, not scoped to a project folder:

- `token.json` — your Google OAuth token
- `config.json` — your Anthropic API key and Google OAuth client credentials
- `history/` — saved scan results, used by `history` and to avoid rescanning the same range

## Privacy

This tool only reads. It never sends email, and never creates or modifies calendar events. All processing happens on your machine and via direct calls to Google's and Anthropic's APIs; there is no intermediary server run by this project.

## License

MIT
