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
3. Go to **Settings -> Billing** and add credit. Anthropic requires a small prepaid balance before a key will work, commonly $5 to $10 to start (check the console for the current minimum)

Scanning a month costs a small fraction of the balance per run, but you do need to fund the account first. This is separate from any Claude subscription you may already have.

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
