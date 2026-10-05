# Distraction Tracker

[![CI](https://github.com/priyanshu-48/distraction-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/priyanshu-48/distraction-tracker/actions/workflows/ci.yml)

Distraction Tracker is a full-stack productivity analytics system that helps users understand how they spend time on distracting websites.

It consists of a browser extension, a Node.js backend, and a React dashboard that visualizes detailed usage analytics.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [System Flow](#system-flow)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [Usage Guide](#usage-guide)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Overview

Distraction Tracker monitors user activity across browser tabs and provides insights into time spent on distracting sites. It’s built to help users track productivity, identify focus leaks, and visualize browsing patterns through intuitive dashboards.

The project integrates:

- **Browser Extension**: Captures tab activity and sends securely to the backend.
- **Node.js/Express API Server**: Stores and aggregates activity data.
- **PostgreSQL Database**: Persistent storage and analytical queries.
- **React Dashboard**: Data visualization and controls.

---

## Architecture

```
Browser Extension → Backend API → Database → Dashboard
```

---

## Key Features

- Tab Activity Tracking: Logs start and end times for active browser tabs
- User Authentication: Secure login and registration using JWT
- Custom Tracked Sites: Users can specify which sites count as distractions
- Analytics Dashboard: Visualizes time spent, tab switches, and daily/weekly trends
- Stat Blocks: Displays quick summaries like "Most Visited Site" or "Total Active Time"
- Multi-User Support: Each user’s data is isolated and secured
- Lightweight Extension: Minimal resources, privacy-safe data collection
- Scalable Backend: Clean separation of routes, controllers, and models

---

## Tech Stack

| Layer         | Technology                    | Purpose                                   |
|--------------|-------------------------------|--------------------------------------------|
| Frontend     | React, Tailwind CSS           | Dashboard UI & analytics visualization     |
| Extension    | JavaScript (Manifest v3)      | Tab tracking and event reporting           |
| Backend      | Node.js, Express.js           | REST API and data aggregation              |
| Database     | PostgreSQL                    | Persistent and analytical storage          |
| Auth         | JWT (jsonwebtoken), bcrypt    | Secure authentication                      |
| API Comm     | Axios                         | HTTP requests (frontend and extension)     |

---

## System Flow

1. User logs in on the dashboard.
2. The dashboard sends the JWT token to the browser extension.
3. The user enables tracking.
4. The extension monitors tab activity:
    - Sends start event when a new tab is active.
    - Sends end event when tab closes or changes.
5. Backend receives, validates, and stores events in the database.
6. Analytics endpoints aggregate the data (total time spent per day/domain).
7. The dashboard fetches analytics and renders charts/stats.

---

## Project Structure

```
distraction-tracker/
├── client/                 # React dashboard (frontend)
│   ├── src/
│   │   ├── components/     # Charts, layouts, reusable UI
│   │   ├── pages/          # Dashboard, Login, Register
│   │   ├── hooks/          # Custom React hooks
│   │   └── api.js          # Axios instance w/ JWT interceptor
│   └── package.json
│
├── server/                 # Backend (Node.js + Express)
│   ├── routes/             # API route definitions
│   ├── controllers/        # Request handling logic
│   ├── models/             # Database queries
│   ├── middleware/         # Authentication middleware
│   ├── db.js               # PostgreSQL connection
│   ├── server.js           # Express app entry point
│   └── package.json
│
├── extension/              # Browser extension
│   ├── background.js       # Main background script
│   ├── manifest.json       # Chrome extension manifest
│   └── icons/              # Extension icons
│
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js (v18 or above)
- PostgreSQL
- npm or yarn
- Chrome browser (for extension testing)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/distraction-tracker.git
cd distraction-tracker
```

### 2. Backend setup

```bash
cd server
npm install
```

Create a `.env` file in `/server`:

```
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/distraction_tracker
JWT_SECRET=your_secret_key
```

Run migrations or manually create tables (see `db.js` and model files).

Start the server:

```bash
npm start
```

### 3. Frontend setup

```bash
cd ../client
npm install
npm run dev
```

This starts the dashboard at http://localhost:5173.

### 4. Browser extension setup

1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Log in on the dashboard; the token will sync to the extension automatically

---

## Usage Guide

1. Open the dashboard and create an account or log in.
2. Click **Start Tracking** — this activates the extension.
3. Browse normally.
4. Return to the dashboard to view:
    - Time spent per site
    - Daily and weekly trends
    - Number of tab switches
    - Most visited domains
5. You can also add or remove distracting sites from your personal list.

---

## Future Improvements

- Replace polling with real-time communication (WebSocket or Server-Sent Events)
- Add refresh tokens and automatic token renewal
- Batch extension data before sending to reduce API load
- Introduce caching (Redis) for analytics queries
- Implement database migrations using Prisma or Knex
- Add automated testing and CI/CD pipeline
- Provide privacy options (record only domain, not full URL)
- Deploy production-ready version (Docker + Cloud hosting)

---

## License

Distributed under the MIT License.