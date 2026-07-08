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
email — which means secrets sit in plaintext in chat history indefinitely,
with no way to know who's seen them or revoke access later.

EnvGuard replaces that with:
- **Company workspaces** — every user gets a default workspace on signup, and can create more.
- **Role-based team access** — admins can invite teammates by email as `admin` or `member`; only admins can send invites.
- **Projects, scoped per company** — each project auto-seeds `development` / `staging` / `production` environments, and you can add custom ones.
- **Encrypted variables** — values are encrypted at rest (AES-256-GCM) before they touch the database.

## Features

- Email/password auth with JWT sessions (httpOnly cookies)
- Company creation + team invites via email (Mailjet)
- Admin vs. member roles, enforced server-side on every request
- Project → environment → variable hierarchy
- Reveal/hide and copy-to-clipboard for variable values
- Encrypted-at-rest storage — the database only ever sees ciphertext

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js, React, Tailwind CSS |
| Backend    | Node.js, Express |
| Database   | Supabase (Postgres) |
| Auth       | JWT (httpOnly cookies), bcrypt |
| Encryption | AES-256-GCM (Node `crypto`), TLS in transit |
| Email      | Mailjet (team invite emails) |

## Architecture

```
User
 └── Company (workspace)          — created on signup, or manually
      ├── company_members         — role: admin | member
      ├── invites                 — pending/accepted/revoked
      └── Project
           └── Environment         — development / staging / production / custom
                └── Variable       — key + AES-256-GCM encrypted value
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

Visit `http://localhost:3000`. Sign up — you'll land in a default "My Workspace" company as its admin, ready to create projects and invite teammates.