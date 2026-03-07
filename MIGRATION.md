# MIGRATION.md

## Project

**英検準一級合格アプリ準一 (JUNICHI)**

This document explains how the current PWA project should later be migrated into a Capacitor-based mobile app for **iOS** and **Android** release.

The current Phase 1 product is intentionally designed as a browser-based PWA deployed on GitHub Pages.
The long-term plan is to preserve as much of the codebase as possible while adding a native mobile wrapper and replacing browser-limited functionality where needed.

---

## Current State

The current project is planned as:

- Vite
- React
- TypeScript
- PWA
- static deployment on GitHub Pages
- local JSON data
- local progress persistence
- browser speech synthesis for audio playback

This is the right starting point for speed, simplicity, and low deployment friction.

However, a browser-based PWA has limitations, especially for features such as:

- speech recognition reliability
- device-level audio behavior
- background behavior
- native app distribution through App Store / Google Play
- deeper access to mobile platform features

---

## Migration Goal

The migration goal is:

1. keep the existing core app logic
2. keep most UI code reusable
3. wrap the app with Capacitor
4. add native iOS and Android projects
5. replace browser-limited implementations with native-friendly implementations where needed
6. prepare the product for App Store and Google Play release

---

## Recommended Migration Timing

Do **not** migrate to Capacitor immediately.

Recommended order:

### Phase 1
- complete the PWA MVP
- validate the vocabulary quiz flow
- validate progress saving
- validate user experience on smartphones

### Phase 2
- improve study flow and structure
- stabilize architecture
- expand content and features

### Phase 3
- migrate to Capacitor
- add native platform projects
- test iOS and Android behavior
- begin store release preparation

This order reduces risk and avoids early complexity.

---

## Architecture Requirements Before Migration

To keep migration smooth, the codebase should follow these rules from the beginning:

- keep domain logic separate from UI
- isolate browser-specific code behind services or adapters
- keep storage access abstracted
- keep speech features abstracted
- avoid placing browser APIs directly inside business logic
- keep routing and app state independent from deployment target

### Especially important

The following features should remain replaceable:

- speech playback service
- future speech recognition service
- storage service
- share / file / device integration

This allows the PWA implementation to be swapped later for native mobile implementations.

---

## Target Migration Path

The expected migration path is:

### Step 1: Stabilize the web app
Make sure the following are already working:

- production build succeeds
- app structure is modular
- PWA behavior is stable
- progress persistence works reliably
- vocabulary audio quiz works end to end

### Step 2: Add Capacitor to the project
Install Capacitor and initialize it in the existing app.

Typical commands will look like:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
```

At that stage, app identifiers, app name, and output paths must be configured correctly.

Suggested app display name:

**英検準一級合格アプリ準一 (JUNICHI)**

### Step 3: Configure the web build output
Capacitor needs the correct web build directory.
For a Vite project, this is usually the production build output directory.

Typical config work includes:

- confirm Vite build output path
- point Capacitor config to that output
- verify asset paths and routing behavior

### Step 4: Add native platforms
Add iOS and Android projects.

Typical commands will look like:

```bash
npx cap add ios
npx cap add android
```

### Step 5: Sync the web app into native shells
After building the web app, sync the latest files into native projects.

Typical command:

```bash
npx cap sync
```

### Step 6: Replace browser-limited implementations where needed
The initial PWA may rely on browser APIs.
During migration, some implementations may need to be replaced or wrapped differently.

Likely areas:

- speech synthesis behavior
- speech recognition
- local notifications
- file system access
- sharing
- native permissions

### Step 7: Test on real devices
Do not rely only on browser preview.
Test on:

- iPhone
- multiple Android devices
- different OS versions where possible

Focus on:

- audio playback
- microphone permissions later
- layout on small screens
- persistence behavior
- startup and resume behavior

### Step 8: Prepare for store release
After native behavior is stable, begin store preparation.

This includes:

- app icons
- splash screens
- screenshots
- privacy descriptions
- permission descriptions
- metadata for App Store / Google Play
- final release testing

---

## What Should Stay Reusable

The following parts should remain mostly reusable during migration:

- quiz UI
- study flow
- spaced repetition logic
- scoring logic
- local data structures
- most React components
- most TypeScript domain logic

This is the main reason to start with a clean modular architecture.

---

## What May Need Refactoring Later

The following parts may need updates during migration:

- speech playback implementation
- future speech recognition implementation
- storage implementation details
- service worker assumptions
- some routing or asset path configuration
- app lifecycle handling

This is normal and should be expected.

---

## Speech Strategy

### Phase 1
Use browser speech synthesis for English playback.

### Later mobile phase
Consider replacing or supplementing browser-based speech handling with:

- native iOS speech-related APIs
- native Android speech-related APIs
- Capacitor plugins where appropriate

### Important policy
Do not tightly couple core study logic to browser speech APIs.
Always keep speech behind a replaceable service layer.

This is especially important because browser support differences can be large across devices.

---

## Storage Strategy

### Phase 1
Use local browser storage for a simple MVP.

### Later mobile phase
Re-evaluate whether to keep the same storage approach or move to a more app-oriented storage solution.

The exact choice can be decided later, but the app should already isolate storage logic behind a service.

---

## Routing and Asset Strategy

To reduce migration pain later:

- avoid overly complex routing early
- keep asset handling simple
- avoid assumptions tied only to GitHub Pages deployment
- test production builds early and often

This helps both PWA deployment and Capacitor migration.

---

## Store Release Preparation Notes

When the project reaches the native app release phase, prepare at least the following:

### Branding
- app name
- subtitle / short description
- app icon
- screenshots
- promotional text

### Compliance
- privacy policy
- permission descriptions
- support contact
- age rating / content rating
- data handling explanation

### QA
- real-device testing
- crash testing
- offline behavior checks
- permission flow checks
- small-screen usability checks

---

## Practical Recommendation

For this project, the best path is:

1. launch the PWA first
2. validate that the learning experience is genuinely useful
3. improve the structure while features are still small
4. migrate to Capacitor only after the core study flow is proven
5. then prepare iOS and Android release

This keeps development manageable and increases the chance of actually shipping.

---

## Summary

**英検準一級合格アプリ準一 (JUNICHI)** should begin as a fast, simple, static PWA.
That PWA should be built with a modular architecture so it can later be migrated into a Capacitor-based mobile app.

The migration should preserve:

- core learning flow
- UI structure
- domain logic
- study data design

And it should later replace or enhance:

- speech-related implementations
- mobile integration points
- native app packaging and release setup

The correct strategy is:

**PWA first, architecture clean, Capacitor later, store release after validation.**
