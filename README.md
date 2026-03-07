# Eiken Pre-1 Study App
**英検準一級合格アプリ準一 (JUNICHI)**

A mobile-first study app for **Eiken Grade Pre-1** learners.

This project starts as a **Progressive Web App (PWA)** that can be deployed on **GitHub Pages**.  
It is also intentionally structured so it can later be migrated to **Capacitor** and released as **iOS / Android apps**.

---

## Project Goal

Build a simple, fast, and practical study app for Eiken Pre-1 learners, starting with a lightweight MVP.

### Phase 1 goal

Create a working PWA for short study sessions focused on vocabulary review.

The Phase 1 MVP includes:

- vocabulary audio quiz
- local JSON vocabulary dataset
- 4-choice Japanese meaning selection
- local study progress saving
- spaced repetition states:
  - again
  - hard
  - good
  - easy
- simple progress screen
- installable PWA
- offline-friendly core study flow
- GitHub Pages deployment

---

## Why this project exists

The app is designed for:

- quick study during small gaps in the day
- mobile-first learning
- repeat review with low friction
- future expansion into:
  - listening
  - reading
  - writing
  - speaking

The long-term goal is not only a web app, but a study product that can eventually be released as a native mobile app.

---

## Phase 1 Scope

### Included

- mobile-first PWA
- vocabulary audio playback using browser speech synthesis
- 4-choice quiz flow
- progress persistence
- spaced repetition logic
- progress screen
- static deployment on GitHub Pages

### Not included yet

- speech recognition
- writing correction
- speaking interview simulation
- external APIs
- paid APIs
- user accounts
- backend
- cloud database
- analytics
- native iOS / Android implementation

---

## Technical Direction

This project is built with:

- **Vite**
- **React**
- **TypeScript**

Architecture principles:

- keep domain logic separate from UI
- isolate browser-specific code behind services/adapters
- keep speech-related logic replaceable
- keep data access modular
- keep the codebase easy to migrate to Capacitor later

The project should remain beginner-friendly, readable, and maintainable.

---

## Planned Future Phases

### Phase 2

- listening practice
- reading practice
- more detailed progress views
- larger dataset support

### Phase 3

- writing practice
- speaking practice
- interview simulation
- native mobile app packaging with Capacitor

### Later

- App Store release
- Google Play release

---

## Repository Structure

A typical structure for this project is expected to look like this:

```text
.
├─ public/
│  ├─ icons/
│  └─ manifest.webmanifest
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  └─ vocab/
│  ├─ lib/
│  │  ├─ speech/
│  │  ├─ storage/
│  │  └─ srs/
│  ├─ data/
│  │  └─ vocab.pre1.json
│  └─ styles/
├─ tests/
├─ .github/
│  └─ workflows/
├─ AGENTS.md
├─ MIGRATION.md
├─ README.md
└─ package.json
```

The exact structure may evolve, but the main principle is:

**simple folders, modular logic, future-ready architecture**

---

## Getting Started

### Requirements

- Node.js 20 or newer recommended
- npm

### Install dependencies

```bash
npm install
```

### Start local development

```bash
npm run dev
```

### Run tests

```bash
npm test
```

### Build for production

```bash
npm run build
```

---

## Deployment

The app is intended to be deployed as a **static site on GitHub Pages**.

### Expected deployment flow

- push code to GitHub
- GitHub Actions builds the app
- built files are deployed to GitHub Pages

Exact deployment details may depend on the workflow file generated in this repository.

---

## PWA Notes

This project should support:

- installable app behavior
- manifest configuration
- icons structure
- offline-friendly core flow

Because this starts as a browser-based PWA, browser support differences may affect some features.

### Important note about speech

Phase 1 uses **browser speech synthesis** for English playback.

Speech recognition is intentionally excluded from Phase 1 because browser support varies significantly across devices and browsers.  
If speech recognition becomes a core feature later, the preferred path is to migrate the project toward **Capacitor + native mobile speech APIs**.

---

## Data Strategy

Phase 1 uses a **local JSON vocabulary dataset**.

Goals:

- keep setup simple
- avoid backend complexity
- make the initial MVP easy to run and deploy
- allow future dataset expansion without changing core logic

Quiz content should not be hard-coded inside UI components.

---

## Testing Strategy

Tests should focus mainly on:

- spaced repetition logic
- scoring behavior
- progress persistence logic

The goal is reliable core logic without overly complex test infrastructure.

---

## Documentation

This repository should contain:

- `README.md`
  - project overview
  - setup instructions
  - development commands
  - deployment notes
- `AGENTS.md`
  - rules and working instructions for Codex / contributors
- `MIGRATION.md`
  - future path from PWA to Capacitor-based mobile app release

---

## Future Mobile App Release

This project is intentionally designed so it can later be migrated to **Capacitor**.

That future migration should make it easier to:

- package the app for iOS
- package the app for Android
- replace browser-only implementations with native mobile implementations where needed
- prepare for App Store / Google Play release

See `MIGRATION.md` for the intended future path.

---

## Development Priorities

When working on this project, prioritize:

1. working core study flow
2. simple UX for smartphone users
3. clear code structure
4. easy GitHub Pages deployment
5. future migration path to mobile apps

---

## Current Status

This repository is currently focused on **Phase 1 MVP**.

Main target:

**a working vocabulary audio quiz PWA for Eiken Pre-1 study**

---

## License

No license has been added yet.  
This repository is currently under private / owner-controlled development unless stated otherwise later.
