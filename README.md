# EnvGuard

**Stop pasting `.env` files into Slack.**

EnvGuard is a full-stack tool for teams to store, organize, and share environment
variables without emailing plaintext secrets around. It replaces manual `.env`
sharing with authenticated, role-based access control, organized by
**company → projects → environments → variables**.

---

## Table of contents

- [What this is](#what-this-is)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Clone and install](#2-clone-and-install)
  - [3. Set up Supabase](#3-set-up-supabase)
  - [4. Set up Mailjet](#4-set-up-mailjet)
  - [5. Configure environment variables](#5-configure-environment-variables)
  - [6. Run it locally](#6-run-it-locally)

---

## What this is

Most dev teams share `.env` files by pasting them into Slack, WhatsApp, or
email which means secrets sit in plaintext in chat history indefinitely,
with no way to know who's seen them or revoke access later.

EnvGuard replaces that with:
- **Company workspaces**  every user gets a default workspace on signup, and can create more, with rename/delete support.
- **Role-based team access**  admins can invite teammates by email as `admin` or `member`; only admins can send invites.
- **Projects, scoped per company** each project auto-seeds `development` / `staging` / `production` environments, with custom ones and rename/delete support too.
- **Encrypted variables** values are encrypted at rest (AES-256-GCM) before they touch the database, with a per-variable `protected` (masked) or `plain` (shown outright) mode.
- **One-time shareable links** generate a link that shows an environment's variables exactly once, with a custom expiry you set (5 minutes to 7 days).

## Features

- Email/password auth with JWT sessions (httpOnly cookies)
- Optional two-factor authentication (TOTP, Google Authenticator / Authy / Microsoft Authenticator compatible), toggled from Settings, with a one-time onboarding prompt after signup
- Company creation + team invites via email (Mailjet), with rename/delete for companies and projects
- Admin vs. member roles, enforced server-side on every request
- Project → environment → variable hierarchy
- Variables can be `protected` (masked, reveal on click) or `plain` (shown outright)
- Reveal/hide and copy-to-clipboard (single or copy-all) for variable values
- Bulk import via pasted `KEY=VALUE` text or uploading a `.env` file directly
- Export an environment as `.env` or CSV
- One-time, expiring shareable links for handing off a whole environment without an account
- Encrypted-at-rest storage the database only ever sees ciphertext
- Skeleton loading states and button spinners throughout, instead of blank/frozen-looking screens
- Inline, in-modal error handling (empty fields, duplicate keys, etc.) instead of silent no-ops
- Structured server-side logging with Pino

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js, React, Tailwind CSS |
| Backend    | Node.js, Express |
| Database   | Supabase (Postgres) |
| Auth       | JWT (httpOnly cookies), bcrypt, TOTP via `otplib` |
| Encryption | AES-256-GCM (Node `crypto`), TLS in transit |
| Email      | Mailjet (team invite emails) |
| Logging    | Pino |

## Architecture

```
User
 └── Company (workspace)          — created on signup, or manually; rename/delete
      ├── company_members         — role: admin | member
      ├── invites                 — pending/accepted/revoked
      └── Project                 — rename/delete
           └── Environment         — development / staging / production / custom
                ├── Variable       — key + AES-256-GCM encrypted value, protected or plain
                └── Shared link    — one-time, expiring, decrypted snapshot for handoff
```

## Getting started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A free [Supabase](https://supabase.com) account
- A free [Mailjet](https://www.mailjet.com) account (for invite emails)

### 2. Clone and install

```bash
git clone <https://github.com/maryamirshad04/EnvGuard>
cd envguard

cd server && npm install
cd ../client && npm install
```

### 3. Set up Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name/region, set a database password.
2. Once the project's ready, open **SQL Editor → New query**.
3. Go to **Project Settings → API**. You need two values from here:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** key (under "Project API keys", marked secret) → this is `SUPABASE_SERVICE_ROLE_KEY`

### 4. Set up Mailjet

1. Sign up at [mailjet.com](https://www.mailjet.com) (the free tier is enough for development).
2. Verify a sender: **Account → Sender domains & addresses → Add a sender address.** This becomes `MAILJET_SENDER_EMAIL`.
3. Go to **Account Settings → API Key Management**. Copy the **API Key** and **Secret Key** — these are `MAILJET_API_KEY` and `MAILJET_API_SECRET`.

### 5. Configure environment variables

Copy the example files and fill in the values from steps 3 and 4:

```bash
cd server
cp .env.example .env
```

```bash
cd ../client
cp .env.local.example .env.local
```

`server/.env.example` shows every key the backend needs — Supabase, JWT, encryption, Mailjet, and local port config.

Two secrets you generate yourself rather than copy from anywhere:

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. Run it locally

In one terminal:
```bash
cd server
npm run dev
```

In a second terminal:
```bash
cd client
npm run dev
```

Visit `http://localhost:3000`. Sign up and you'll land in a default "My Workspace" company as its admin, ready to create projects and invite teammates.
