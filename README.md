# 🧠 MindForge

MindForge is a desktop application designed to help students track their focus, manage distractions, and build better study habits. It uses a **Session-Based Architecture** to monitor your active applications and browser tabs, computing a real-time **Focus Score** to visualize your productivity.

## ✨ Features
- **Real-Time Focus Score**: A score from 0-100 that updates every 10 seconds based on your active window.
- **In-Memory Session Tracking**: Total privacy and zero lag. Tracking only happens when you start a session, keeping data locally in RAM until the session ends.
- **Focus Interventions**: Detects "focus spirals" (rapid drops in score) and suggests interventions.
- **Deep Work Ramp**: Tracks your daily deep work minutes against your goals.
- **Habit Tracker**: Logs daily habits like reading, meditation, and focus sessions, calculating your current streak.
- **Focus Rooms**: Multiplayer virtual rooms where you can study alongside others and react with emojis.
- **Chrome Extension integration**: Syncs browser tab categories to strictly monitor digital distractions.

## 🛠️ Tech Stack
- **Desktop Engine**: Electron + Node.js
- **Frontend UI**: React + Vite + Tailwind CSS + Recharts
- **Database**: Supabase
- **System Monitoring**: Custom PowerShell active window watcher (`child_process.execFileSync`)
- **Real-Time Data**: Express.js + WebSockets

---

## 📁 Project Structure

```text
mindforge/
├── main.js                  # Electron main process (Window management)
├── preload.js               # IPC bridge (Secure renderer <-> main communication)
├── seed.js                  # Script to seed Supabase with 7 days of demo data
├── supabase_schema.sql      # Supabase database schema for tracking scores and habits
├── .env                     # Supabase credentials (SUPABASE_URL, SUPABASE_ANON_KEY)
│
├── core/                    # Backend Node.js logic (Runs in Electron Main)
│   ├── db.js                # Supabase client and query functions
│   ├── session.js           # In-memory session manager (holds active events)
│   ├── watcher.js           # Polls active Windows app using PowerShell every 2s
│   ├── scorer.js            # Calculates the Focus Score every 10s using session data
│   └── server.js            # Express & WebSocket server for the UI
│
├── renderer/                # React Frontend (Runs in Electron Renderer)
│   ├── index.html           # Vite entry HTML
│   ├── vite.config.js       # Vite bundler configuration
│   └── src/
│       ├── main.jsx         # React root
│       ├── App.jsx          # App layout, Sidebar, and Routing
│       ├── index.css        # Global CSS, Custom UI theme, and Glassmorphism
│       └── components/
│           ├── LiveScore.jsx   # Live session controls & animated focus score
│           ├── Heatmap.jsx     # 7x24 focus heatmap visualization
│           ├── DeepWorkRamp.jsx# Weekly bar chart and daily sprint progress
│           ├── FocusDebt.jsx   # Tracks accumulated un-returned focus time
│           ├── DailyHabits.jsx # Cards + Streak counter + Contribution grid
│           └── FocusRoom.jsx   # Virtual multiplayer room and live status
│
└── extension/               # Chrome Extension (Distraction blocker)
    ├── manifest.json        # MV3 manifest
    ├── background.js        # Tracks tabs and POSTs events to desktop server
    └── content.js           # Injects friction overlays on distraction websites
```

---

## 🚀 Setup & Installation

### 1. Database Setup
1. Create a free project on [Supabase.com](https://supabase.com/).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste the contents of `supabase_schema.sql` into the editor and hit **Run** to generate the 5 required tables.

### 2. Environment Variables
In the root directory of the `mindforge` project, replace the placeholder values in `.env` with your Supabase credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_actual_key
NODE_ENV=development
```

### 3. Install Dependencies
```bash
# Install root (Electron/Backend) dependencies
npm install

# Install UI (Vite/React) dependencies
cd renderer
npm install
cd ..
```

### 4. (Optional) Seed Demo Data
Populate your database with 7 days of realistic habit, session, and focus score data to see the UI in action immediately.
```bash
npm run seed
```

### 5. Start the App
Run the Vite development server and launch the Electron app concurrently.
```bash
npm start
```

### 6. Chrome Extension
If you want to track browser tabs efficiently:
1. Open Google Chrome.
2. Go to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `/extension` directory.

---

## ⚙️ How It Works (Session Architecture)
1. **Idle State**: The app boots entirely idle. The local watcher relies heavily on intent rather than continuous background surveillance.
2. **Focus Session**: In the **Dashboard**, clicking "Start Session" activates tracking. Your "goal" is saved, and `core/watcher.js` begins querying your OS for the active application using a native Win32 API.
3. **In-Memory Tracking**: Event changes are stored in RAM within `core/session.js`. We purposefully don't write to Supabase continuously to ensure entirely zero-latency performance.
4. **Scoring Engine**: Every 10 seconds, `core/scorer.js` reads the last 60 seconds of memory, classifies application types (Productive vs. Distraction), and broadcasts a computed score to the UI over WebSockets (`ws://localhost:39871`).
5. **Session End**: Upon ending the session, Node computes the session's overall Average Score and Deep Work metrics, compiling everything into a secure payload dispatched to Supabase for historical tracking.
