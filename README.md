# Deadbolt for Raycast

Search Passwords finds items in your Deadbolt vault from Raycast and copies
passwords, usernames, URLs and one-time codes. The extension drives the
`deadbolt` CLI; it stores nothing and never touches a passphrase.

## Commands

| Command | What it does |
| --- | --- |
| Search Passwords | Lists items from `deadbolt ls`. Copy password (concealed), username, URL, one-time code, show fields, star or unstar, lock the store, open Deadbolt. |

Copied passwords use Raycast's `concealed` copy, so they stay out of Raycast's
clipboard history and other clipboard managers.

## Setup

1. Install [Deadbolt](https://github.com/anomalyco/deadbolt) and unlock its
   store (the desktop app or `deadbolt unlock`).
2. Install the extension in Raycast.
3. If Raycast cannot find `deadbolt`, set its path in the extension's
   preferences (for example `/opt/homebrew/bin/deadbolt`).

When the store is locked, copying shows "Deadbolt is locked. Open Deadbolt to
unlock it."

## Local development

```bash
npm install        # or bun install
npm run dev        # open the extension inside Raycast
```

Check the CLI wrapper against a real, unlocked Deadbolt install (no secrets
are printed):

```bash
bun scripts/smoke.ts
```
