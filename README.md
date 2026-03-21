# FocusForge – Adaptive Focus & Intelligent Learning Platform

**FocusForge** is an all-in-one productivity and learning ecosystem designed for students who want to eliminate distractions, study smarter, and achieve real mastery.

It combines **real-time focus monitoring**, **adaptive personalized learning**, and a **premium desktop experience** into a seamless, privacy-first platform.

### 🎯 Three Integrated Products

1. **FocusTrack**  
   Real-time distraction monitoring using phone sensors + live admin dashboard  
   → Detects phone pick-ups, app switching, screen locks → computes Focus Score

2. **Adaptive Learning Engine**  
   Upload any content (YouTube, PDF, PPT) → auto-generates assessments → adapts difficulty + tracks concept mastery  
   → Spaced repetition, learning speed detection, weak-concept diagnosis

3. **MindForge Desktop**  
   Native cross-platform desktop app (Electron) with live Focus Score, Pomodoro, ambient sounds, app blocking, habit tracking, multiplayer Focus Rooms, and AI interventions

All three work together:  
Start a session in MindForge → scan QR to connect phone → FocusTrack monitors in real-time → Adaptive Engine delivers personalized content → see progress live on desktop + admin dashboard.

---

## ✨ Core Features

- Real-time phone motion & app-switch detection (DeviceMotion + Page Visibility API)
- Intelligent distraction scoring & correlation engine
- Live admin/teacher dashboard with WebSockets
- Content upload → auto concept extraction + question generation
- Adaptive difficulty + per-concept mastery tracking (0.0–1.0)
- Spaced-repetition revision assessments
- Desktop-class focus tracking (active window + Chrome tab categories)
- Pomodoro timer, ambient sounds, distraction shield
- Multiplayer virtual study rooms + leaderboard
- Habit streaks, deep work ramp, weekly analytics & heatmaps
- AI-powered focus interventions (Llama-3.1 via Groq)

---

## 🛠 Tech Stack Overview

| Layer                  | Technologies                                                                 |
|------------------------|-------------------------------------------------------------------------------|
| **Desktop Client**     | Electron, React, Vite, Tailwind CSS, Node.js, Recharts, Clerk Auth           |
| **Mobile / Dashboard** | HTML5, Vanilla JS, PWA, DeviceMotion, Page Visibility, Wake Lock APIs        |
| **Backend**            | Django 5, Django Channels, Daphne (ASGI), Django REST Framework              |
| **Real-time**          | WebSockets (Channels), Redis (prod) / in-memory (dev)                        |
| **Database**           | SQLite (dev), PostgreSQL (prod), Supabase (MindForge sync)                   |
| **Browser Integration**| Chrome Extension (Manifest V3)                                               |
| **AI / Processing**    | Groq API (Llama-3.1), Content/question generation agents                     |
| **Local / Storage**    | LocalStorage, File System API, In-memory session tracking (RAM-only)         |
| **Dev Tools**          | VS Code, VS Code Extension API                                               |

---

## 🚀 Quick Start (Development)

### Prerequisites
- Python 3.10+
- Node.js 18+
- Git
- (optional) Redis, Supabase account, Groq API key

### 1. Clone the repo
```bash
git clone https://github.com/your-username/focusforge.git
cd focusforge
```

### 2. Backend (Django + FocusTrack + Adaptive Engine)
```bash
cd backend
python -m venv venv
source venv/bin/activate    # or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
```

Run ASGI server (for WebSockets):
```bash
daphne -b 0.0.0.0 -p 8000 focusforge.asgi:application
```

### 3. MindForge Desktop App
```bash
cd ../mindforge
npm install
cd renderer && npm install && cd ..
npm start
```

### 4. Chrome Extension (optional – for better tab tracking)
- Go to `chrome://extensions/`
- Enable Developer mode
- Load unpacked → select `/mindforge/extension`

### 5. Test the full loop
1. Start Django server
2. Open `http://localhost:8000` → create session → generate QR
3. Scan QR with phone browser → PWA starts monitoring
4. Start session in MindForge desktop → see live Focus Score

---

## 📂 Project Structure

```
focusforge/
├── backend/                  # Django + Channels + Adaptive Engine
│   ├── core/                 # models, consumers, signal processor
│   ├── dashboard/            # admin live view
│   ├── pwa/                  # mobile PWA files
│   ├── manage.py
│   └── requirements.txt
├── mindforge/                # Electron Desktop App
│   ├── core/                 # Node.js logic (watcher, scorer, session)
│   ├── renderer/             # React + Vite frontend
│   ├── extension/            # Chrome MV3 extension
│   ├── main.js
│   └── package.json
├── docs/                     # diagrams, architecture notes
└── README.md
```

---

## 🛡️ Privacy & Security

- Desktop tracking only active during sessions (in-memory, no continuous spying)
- Mobile signals ephemeral until session ends
- No third-party analytics
- Local network binding for dev (LAN IP)
- Supabase used only for persistent user data (habits, scores)

---

## 📈 Roadmap (Planned)

- Mobile native apps (iOS/Android) instead of PWA
- Teacher/parent multi-student dashboard
- Gamification: badges, XP, streaks across devices
- Offline mode for assessments
- Exportable progress reports (PDF)

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing-thing`)
3. Commit (`git commit -m 'Add amazing thing'`)
4. Push (`git push origin feature/amazing-thing`)
5. Open Pull Request

---

Made with ❤️ for students who want to **focus deeply and learn faster**.
