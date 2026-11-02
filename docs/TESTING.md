# Testing & results

All results below come from actual runs on 26 Oct, 30 Oct and 2 Nov 2026 (PostgreSQL 16, Node 22, Chromium).

| Suite | Tool | Result |
|---|---|---|
| Unit tests (pure logic) | Vitest | 27 passed |
| API integration tests (real database) | Vitest + Supertest | 73 passed (incl. 11 notification, 7 family-sharing, 6 push tests) |
| Client unit tests (quick-add parser) | Vitest | 9 passed |
| Browser end-to-end (desktop + mobile) | Playwright | 8 passed |
| Scripted browser walkthroughs | Playwright (Python) | 22/22 pantry, 18/18 recipes, 12/12 3D & rewards (with real WebGL rendering), 11/11 family sharing (two people), 18/18 Hindi & Kannada, push notification in the service worker |

Run them yourself: `npm test` (API) and `npm run test:e2e` (browser, with the API running).

## API & unit tests (100)

**auth & security** — `api.test.ts`
- ✅ health check reports the database
- ✅ validates registration fields
- ✅ rejects duplicate emails and wrong passwords with safe messages
- ✅ stores the session in an httpOnly cookie
- ✅ protects routes and blocks requests without the CSRF header
- ✅ password reset: dev link works once and signs out old sessions

**pantry items** — `api.test.ts`
- ✅ creates an item and gives new accounts default categories and locations
- ✅ validates required fields, quantities and dates
- ✅ allows items with no expiry only when explicitly marked
- ✅ detects duplicates and can merge them as a new batch
- ✅ searches, filters, sorts and paginates
- ✅ respects the configurable warning period
- ✅ rejects stale edits (optimistic concurrency)
- ✅ soft-deletes to trash, restores, and permanently deletes

**stock: FEFO, consumption, waste** — `api.test.ts`
- ✅ consumes from the batch that expires first
- ✅ never lets stock go negative
- ✅ converts compatible units and rejects incompatible ones
- ✅ asks before recording expired food as eaten; discarding records waste and cost
- ✅ marks an item opened and shortens its effective expiry
- ✅ flags low stock separately from expiry

**data isolation between users** — `api.test.ts`
- ✅ one user can never read, change or delete another user's data

**categories & locations** — `api.test.ts`
- ✅ won't delete a category in use unless items are reassigned
- ✅ prevents duplicate names (case-insensitive)

**shopping list** — `api.test.ts`
- ✅ adds low-stock items, prevents duplicates and restocks the pantry on purchase

**dashboard, notifications, analytics** — `api.test.ts`
- ✅ dashboard counts come from real data and update after changes
- ✅ notifications are generated once (no duplicates) and can be marked read
- ✅ analytics handles an empty account and validates ranges
- ✅ demo data loads, shows insights, and clears without touching real data

**import / export / backup** — `api.test.ts`
- ✅ previews errors and duplicates, then imports valid rows
- ✅ exports CSV safely and round-trips a backup into another account
- ✅ rejects a file that isn't a valid backup
- ✅ produces a PDF report

**images** — `api.test.ts`
- ✅ accepts real images only and keeps them private

**dates** — `unit.test.ts`
- ✅ computes 'today' in the user's time zone, not UTC
- ✅ falls back to UTC for an unknown zone
- ✅ rejects impossible dates and accepts leap days
- ✅ adds and diffs days across month and year boundaries

**expiry status** — `unit.test.ts`
- ✅ classifies expired / expiring / safe using the warning period
- ✅ never treats a missing date as safe
- ✅ uses the opened date when it comes before the printed date
- ✅ item status is the most urgent batch; no stock means out of stock
- ✅ low stock is independent of expiry

**units** — `unit.test.ts`
- ✅ converts within a group and refuses across groups
- ✅ avoids floating point drift
- ✅ normalises report units

**FEFO** — `unit.test.ts`
- ✅ takes from the batch that expires first
- ✅ reports a shortfall instead of going negative

**run-out prediction** — `unit.test.ts`
- ✅ needs at least two records
- ✅ estimates days left from the recent daily rate

**CSV** — `unit.test.ts`
- ✅ neutralises spreadsheet formulas (CSV injection)
- ✅ quotes commas and newlines and starts with a BOM
- ✅ import accepts ISO and day-first dates

**recipe suggestions** — `unit.test.ts`
- ✅ prefers recipes that use expiring items and never uses expired ones

**recipes** — `recipes.test.ts`
- ✅ every recipe is complete and its step ingredients exist
- ✅ finds many dishes for potato, by English, plural or Hindi name (dishes named after it first)
- ✅ converts recipe amounts into pantry units only when comparable
- ✅ splits and reads online instructions (steps, actions, timers, YouTube ids)
- ✅ explores by ingredient and reports online search as disabled honestly
- ✅ scales quantities by servings and checks them against the pantry
- ✅ 'I cooked this' takes ingredients out of the pantry and reports items that ran short (and can't touch another user's items)
- ✅ reads online recipes (TheMealDB, simulated response) with video and pantry check, and survives an outage

**loophole fixes** — `api.test.ts`
- ✅ a double-clicked 'Add to pantry' on a shopping entry adds it only once
- ✅ a double-clicked 'Add to pantry' on a new item creates it only once
- ✅ a double-clicked 'Load demo data' loads it only once
- ✅ two simultaneous sign-ups with one email give a clear message
- ✅ reset links are never shown on screen unless explicitly enabled for development
- ✅ clean-up removes photos never attached to an item, but keeps attached ones
- ✅ sign out of all devices invalidates every session
- ✅ deleting an account needs the password and removes all of its data

**gamification** — `gamification.test.ts`
- ✅ levels and progress
- ✅ streaks: current run ends today or yesterday; best is the longest ever
- ✅ challenges rotate weekly and are the same within a week
- ✅ new account starts at zero; real actions earn points (use +10, rescue +15, add +5) and badges, celebrated once
- ✅ demo data never earns points
- ✅ caps repeated actions per day so points can't be farmed
- ✅ cooking a recipe counts as a cook

## Browser end-to-end tests (`client/e2e/core-flows.spec.ts`)

Each runs on a desktop browser and on a phone-sized screen (Pixel 7):

- ✅ Add an item (with validation errors first), see it on the dashboard, record use in a different unit (kg from a g item), and confirm the data survives a page reload
- ✅ Load demo data, try to record use of expired food (the app asks first), record it as waste instead, add low-stock items to the shopping list, buy one and confirm it lands in the pantry
- ✅ Signed-out visitors are sent to the sign-in page
- ✅ Explore recipes for “potato”, open Jeera Aloo, scale to 4 servings (300 g → 600 g), go through the cook-along, then “I cooked this” records 0.6 kg potatoes as used

## Scripted walkthrough (22 steps)

Registration validation · registration · add-item validation (name, expiry) · save item · dashboard refresh · duplicate detection · merge as batch · over-stock use blocked · unit conversion · FEFO quantity · demo data without clashing with real items · expired-food safeguard · record as waste · low-stock to shopping list · purchase restocks pantry · calendar · recipes · notifications · persistence after refresh · mobile layout has no horizontal scrolling · sign-out redirects to sign-in.

## Recipe walkthrough (18 steps)

Recipes page opens · pantry ingredient chips · 13 potato dishes · online outage explained · base quantity · pantry check (flags “use soon”) · scaling to 4 servings · cook-along opens · scaled amount on the step · timer counts down · arrow-key navigation · finish screen · cooked dialog pre-filled · ingredients recorded · pantry reduced 1 kg → 0.4 kg · online recipe embeds its YouTube video (simulated response) · cook-along for online recipes · no sideways scrolling on a phone.

## 3D & rewards walkthrough (12 steps, WebGL via SwiftShader)

Signed-out home shows the 3D welcome page · 3D canvas renders · empty dashboard shows the shelf · level chip starts at level 1 / 0 pts · badge card appears without blocking · page stays usable during the celebration · “+25 pts” pop (use + rescue) · two badges celebrated together · demo data adds no points · rewards page · no sideways scrolling on a phone (dark mode) · reduced-motion users still get the shelf. Clicking a jar opened the right item 3 of 3 times. The production build ran under the strict security policy with 0 violations.

Issues found and fixed while testing: jar labels overlapped (now laid out per frame and sized to the gap between jars); the shelf was cut off on phones (camera now steps back to fit); the label helper triggered React unmount warnings (replaced); the confetti library's background worker was blocked by the security policy (now runs without one); the first celebration was a modal that blocked the page (now a corner card); the card was trapped by the header's blur effect (now rendered at page level).

## Loophole audit (30 Oct 2026)

Each was first reproduced against the running app by firing real requests, then fixed and re-checked with the same requests:

| Loophole | Before | After |
|---|---|---|
| Double-click “Add to pantry” on a shopping entry | Item created twice | Second request refused (409), one item |
| Double-click “Add to pantry” on a new item | Two identical items | Second request offered “add as batch” (409) |
| Double-click “Load demo data” | 38 demo items | 19 demo items |
| Two sign-ups with the same email at once | “That name is already in use” | “An account with this email already exists” |
| Server deployed without `NODE_ENV=production` | Anyone could get a reset link by typing an email | Links only shown with an explicit development flag |
| Photos uploaded but never saved | Kept forever, unlimited | Removed daily, 300-photo cap |
| Deleting the last item on the last page | Page showed “empty” | Steps back to the previous page |
| Two simultaneous uses of the same stock | Already safe (row lock): second refused | Unchanged |

Production build checked in a browser with the strict security policy on: 0 policy violations, 0 script errors (theme, API calls, charts, recipes, cook-along, quick add, sign out everywhere).

## Bugs the tests caught during development (and fixes)

| Found by | Problem | Fix |
|---|---|---|
| API tests | Optional fields (cost, barcode) left out of a request were treated as required by the validation library | Marked them optional explicitly in shared validators; added a test that a partial edit leaves other fields untouched |
| Browser walkthrough | Signing out succeeded on the server but the screen didn't update | Update the signed-in user before clearing cached data |
| Browser tests (mobile) | The phone layout's “Use” button had no item name for screen readers | Added descriptive labels (“Record use of Curd”) matching the desktop table |
| Screenshot review | Category chart labels were clipped; dashboard freshness bars ignored purchase dates | Horizontal bars with full labels; server now returns the purchase date of the next-expiring batch |
| Palette validator | Green vs red chart lines were hard to tell apart with colour-blindness | Switched multi-series charts to a validated colour-blind-safe palette, plus a dashed line and table view |

## Not covered by automated tests

- Sending email through a real provider. Delivery to a local test mail server is tested, including refusals.
- Subscribing to push on a real phone (needs Google/Apple push services). Sending, de-duplication, expired devices and the service worker's notification are tested.
- Camera barcode scanning (needs a physical camera). Manual barcode entry and lookup are covered.
- `docker compose up` itself (base images can't be downloaded in the build environment). Every Dockerfile step and the nginx config were run without Docker.
- Live TheMealDB requests and YouTube playback (blocked from the build environment; tested with simulated responses).
- Read-aloud narration (depends on the browser's speech voices).

## 2 Nov 2026 additions

| Area | What was checked | Result |
|---|---|---|
| Notifications | Every alert type (expired, expiring, low stock, running out); each settings switch; warning period; no duplicates; new batch alerts again; mark read; delete; another user can't touch them; sign-in required | Found and fixed: a deleted alert came back on the next refresh. Alerts are now dismissed, not deleted, so they stay gone |
| Email reminders | Local test mail server: sent once, not repeated next day, nothing for users who turned email off, `FAILED` when the server refuses | Pass |
| Family sharing | Join by code (case/spaces ignored) and by invite link through sign-up; shared pantry both ways; "by Asha" in the activity log; view-only blocked from changes but can manage own notifications; only the owner manages; removal takes effect at once; new code invalidates old; leave/delete/owner account deletion never delete anyone's items; strangers see nothing | Found and fixed: after signing up from an invite link the app jumped to the home page instead of the invite |
| Phone notifications | Stable server keys; subscribe/unsubscribe; test push; insecure endpoints rejected; daily summary to every household device, once; expired devices removed; real service worker shows the notification and opens Notifications | Pass |
| Hindi & Kannada | Welcome, sign-up, dashboard, pantry, add item, toasts, settings in both languages; switching without reload; remembered after reload; item names untouched; back to English leaves nothing behind; phone layouts with long Kannada words don't scroll sideways | Found and fixed: the language picker crowded the phone header; "About 3 days left" split into fragments |
| Docker | Both Dockerfiles replayed in a clean folder; API in production mode; nginx config with security headers and `/api` proxy | Pass (base images couldn't be pulled) |

