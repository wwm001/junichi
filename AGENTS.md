# AGENTS.md

## Project overview
This repository is for an Eiken Pre-1 study app.
**英検準一級合格アプリ準一 (JUNICHI)**

The product should start as a mobile-first PWA that runs as a static site on GitHub Pages.
The architecture should also be prepared so the project can later be migrated to Capacitor and released as iOS and Android apps.

## Current phase
Build only Phase 1 MVP.

Phase 1 includes:
- vocabulary audio quiz
- local JSON dataset
- local progress saving
- spaced repetition review states
- simple progress screen
- PWA installability
- GitHub Pages deployment
- offline-friendly core study flow

## Definition of done
A task in this repository is complete only when all of the following are true:
- the app builds successfully
- the app runs locally
- the core feature works end to end
- tests relevant to the changed logic pass
- documentation is updated when behavior or setup changes

## Product goals for Phase 1
- mobile-first experience
- simple and fast study flow
- beginner-friendly setup
- reliable static deployment
- maintainable structure for future expansion

## Architecture rules
- Keep domain logic separate from UI components
- Keep browser-specific code isolated behind services or adapters
- Keep speech-related logic abstracted so browser implementations can later be replaced by native mobile implementations
- Avoid hard-coding browser-only assumptions deep in business logic
- Keep local data access isolated so future backend or API integration is possible with minimal refactoring
- Prefer small reusable modules
- Prefer readability and maintainability over clever abstractions
- Keep the folder structure simple and easy to understand

## Planned future modules
These are not part of Phase 1, but the architecture should make them easy to add later:
- listening
- reading
- writing
- speaking

## Out of scope for Phase 1
Do not add these yet:
- speech recognition
- writing correction
- speaking interview simulation
- external AI APIs
- paid APIs
- backend
- database
- authentication
- user accounts
- analytics
- store submission automation
- native iOS/Android code in this phase

## Technical constraints
- The app must work as a static site
- The app must not require a server
- The app must not depend on paid services
- The app must be easy to deploy on GitHub Pages
- The app must be easy to migrate later to Capacitor
- Prefer simple and reliable dependencies
- Avoid unnecessary libraries

## UX rules
- Prioritize smartphone use first
- Keep screens uncluttered
- Make the main study flow usable in short sessions
- Minimize taps required to answer a question
- Show clear feedback for correct and incorrect answers
- Keep progress indicators simple and readable

## Data rules
- Use local JSON files for Phase 1 study content
- Keep sample data small but realistic
- Structure data so more vocabulary items can be added later without changing app logic
- Do not hard-code quiz content directly inside UI components

## Speech rules
- Phase 1 may use browser speech synthesis for English playback
- All speech functionality must be wrapped in replaceable services or adapters
- Do not couple app logic directly to browser speech APIs
- Prepare for future replacement with native mobile speech implementations

## Testing rules
- Add tests for domain logic when practical
- Prioritize tests for spaced repetition logic, scoring, and progress persistence behavior
- Keep tests simple and readable
- Do not add overly complex test infrastructure

## Documentation rules
- Keep README up to date
- README should explain:
  - what the app does
  - how to install dependencies
  - how to run locally
  - how to test
  - how to build
  - how to deploy to GitHub Pages
- Keep MIGRATION.md up to date
- MIGRATION.md should explain the intended path to Capacitor-based iOS/Android app release later

## Implementation style
- Prefer working code over long planning text
- Make reasonable assumptions when details are missing
- Use clear naming
- Avoid premature optimization
- Avoid unnecessary refactors unrelated to the current task
- When changing structure, preserve beginner readability

## Commands
Use these commands when relevant:
- install: npm install
- dev: npm run dev
- build: npm run build
- test: npm test

## Expected deliverables for Phase 1
- Vite + React + TypeScript project scaffold
- mobile-first PWA
- vocabulary audio quiz
- local JSON dataset
- local progress persistence
- spaced repetition states: again, hard, good, easy
- simple progress screen
- tests for core logic
- GitHub Actions workflow for build and GitHub Pages deployment
- README
- MIGRATION.md

## Final output format for major implementation tasks
At the end of a major task, provide a short summary with:
1. what was implemented
2. how to run it locally
3. how to test it
4. how to deploy it
5. what remains for the next phase