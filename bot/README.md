# 🔔 Kalakolchik — Spaced Repetition Telegram Bot

> Fight the forgetting curve. Send notes, photos, and videos to this Telegram bot and receive smart, scheduled reminders to help you remember what matters.

---

## 📋 Features (MVP)

- `/start` — Register and receive a welcome message
- **Text notes** — Send any text message to save it as a memory
- **Photos** — Send images (with optional caption) uploaded to Supabase Storage
- **Videos** — Send video clips uploaded to Supabase Storage
- **Spaced repetition intervals** — Choose 1 day, 3 days, 6 days, or enter a custom number of hours
- **Automatic reminders** — Background scheduler delivers due reminders every minute

---

## 🏗️ Tech Stack

| Layer | Technology |
|:---|:---|
| Runtime | Node.js 18+ (TypeScript) |
| Telegram Bot Framework | [grammY](https://grammy.dev/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL) |
| File Storage | Supabase Storage |
| Scheduler | [node-cron](https://github.com/node-cron/node-cron) |
| Dev Tools | [tsx](https://github.com/privatenumber/tsx) |

---

## 🚀 Setup & Installation

### Step 1: Prerequisites

- [Node.js 18+](https://nodejs.org/) installed
- A [Telegram Bot Token](https://t.me/BotFather) from @BotFather
- A [Supabase](https://supabase.com/) project created

---

### Step 2: Set Up Supabase

#### 2a. Run the Database Schema

1. Open your [Supabase Dashboard](https://app.supabase.com/)
2. Go to your project → **SQL Editor**
3. Copy and paste the contents of [`schema.sql`](./schema.sql)
4. Click **Run** to create all the tables and indexes

#### 2b. Create the Storage Bucket

1. In your Supabase Dashboard, go to **Storage**
2. Click **New bucket**
3. Name it exactly: `memories`
4. Leave it as **private** (the bot generates signed URLs)
5. Click **Create**

---

### Step 3: Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env
```

Then open `.env` and fill in your values:

```env
TELEGRAM_BOT_TOKEN=1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

| Variable | Where to find it |
|:---|:---|
| `TELEGRAM_BOT_TOKEN` | @BotFather on Telegram → `/newbot` |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_KEY` | Supabase Dashboard → Settings → API → `anon` public key (or `service_role` for full access) |

> **Tip:** For production, use the `service_role` key. For local testing, the `anon` key works if RLS is disabled on your tables.

---

### Step 4: Install Dependencies & Run

```bash
# Navigate to the bot directory
cd bot

# Install dependencies
npm install

# Run in development mode (auto-restarts on file changes)
npm run dev
```

You should see:
```
🔔 Kalakolchik Bot is starting...
[Scheduler] Reminder scheduler started — running every minute.
✅ Bot is running as @YourBotName
📬 Listening for messages...
```

---

## 🧪 Testing the Bot

1. Open Telegram and search for your bot by its username
2. Send `/start` → You should get a welcome message
3. Send any text note (e.g. `The mitochondria is the powerhouse of the cell`)
4. Tap **1 Day** from the keyboard
5. Check your Supabase `memories` and `reminders` tables — you should see the new records
6. To quickly test the scheduler, go into Supabase SQL Editor and update the reminder:
   ```sql
   UPDATE reminders SET scheduled_at = NOW() - INTERVAL '1 minute' WHERE status = 'pending';
   ```
7. Within a minute, the bot should send you back your note!

---

## 📁 Project Structure

```
bot/
├── schema.sql                     # PostgreSQL schema for Supabase
├── .env.example                   # Environment variables template
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                   # App entry point
    ├── config/
    │   └── env.ts                 # Env validation
    ├── db/
    │   └── supabase.ts            # Supabase client
    ├── services/
    │   ├── userService.ts         # User registration
    │   ├── memoryService.ts       # Media upload & memory creation
    │   └── reminderService.ts     # Reminder CRUD & scheduling
    ├── bot/
    │   ├── index.ts               # Bot & handler registration
    │   ├── keyboards.ts           # Inline keyboards
    │   └── handlers/
    │       ├── startHandler.ts    # /start command
    │       ├── mediaHandler.ts    # Text/photo/video handling
    │       └── callbackHandler.ts # Interval selection callbacks
    └── scheduler/
        └── reminderCron.ts        # Background cron job
```

---

## 🛠️ Available Scripts

| Script | Description |
|:---|:---|
| `npm run dev` | Start bot with hot-reload (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run typecheck` | Check types without emitting files |

---

## 📌 Notes & Limitations (MVP)

- Reminders are delivered in UTC timezone
- Only 1 reminder per memory (future: multiple spaced repetition rounds)
- Media files larger than Telegram's 20MB download limit may fail
- Bot uses long-polling mode (suitable for local/VPS deployment — not serverless)
