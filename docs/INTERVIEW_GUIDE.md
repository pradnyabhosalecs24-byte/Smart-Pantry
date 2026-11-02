# Explaining Smart Pantry in an interview

## 60-second pitch
Households throw away food because they forget what they have and when it expires. Smart Pantry is a full-stack web app that tracks pantry items **batch by batch**, warns before food expires, tells you what to use first, and measures waste over time. It's built with React and TypeScript on the front end, Express and Prisma on the back end, and PostgreSQL. It's secured with httpOnly-cookie authentication and per-user data isolation, and covered by 100 API tests and Playwright browser tests in CI.

## A good 5-minute demo path
1. Register → click **Try with demo data**.
2. Dashboard: show the **3D shelf** (move the mouse, click a jar), the level ring and streak, then point out the status strip (each count is a link), **Use these first** with freshness meters, and the **Running out soon** forecast.
3. Open **Toned Milk** → show two batches with their own dates. Click **Mark opened** on the newer one and watch its expiry move earlier.
4. **Record use** of 1.2 l → show it took the older batch first (FEFO).
5. Try to record use of **Paneer** (expired) → the app asks first; choose **Record as wasted**.
6. **Analytics** → waste falling month by month, **Show table** on a chart, download the **PDF report**.
7. **Recipes** → pick **Potato** → 13 dishes → open **Jeera Aloo** → change servings to 4 (amounts double) → **Start cook-along** → press **Play all steps** (animated and narrated) → finish → **I cooked this** updates the pantry.
8. **Shopping list** → **Add low-stock items** → tick one off → it goes into the pantry with a real expiry date.
9. Toggle dark mode, switch the language to हिन्दी or ಕನ್ನಡ, and resize to phone width.
10. **Settings → Family sharing** → create a household, open the invite link in a private window, join, and show both people editing one pantry ("by Asha" in the activity log).

## Questions you'll likely get

**Why store batches instead of one quantity per item?**
Two packs of the same food can have different expiry dates. With one quantity you lose that information. Batches allow First-Expiry-First-Out: when you use 1.5 l of milk, it comes from the pack that expires first (`server/src/lib/fefo.ts`).

**How do you decide "expiring soon"? Isn't it stored?**
No. It depends on *today*, so storing it would go stale. The server computes it on every read: today's date in the user's time zone, compared with each batch's effective expiry, using the user's warning period (`server/src/lib/status.ts`).

**Why compare dates as strings / why DATE columns?**
Expiry is a calendar day, not a moment. If you compare timestamps in UTC, an item in India flips to "expired" at 5:30 AM. Using `YYYY-MM-DD` and the user's time zone avoids that. There's a unit test for exactly this case.

**What if two requests change the same stock at once?**
Stock changes run in a database transaction that locks the item's batch rows (`SELECT … FOR UPDATE`), so stock can't go negative. Item edits use optimistic locking: each item has a `version`, and an edit based on an older version gets a 409 conflict instead of silently overwriting.

**How is authentication secured?**
Passwords are hashed with bcrypt. The login token is a JWT in an **httpOnly** cookie, so page JavaScript can't steal it. Writes need a custom header (CSRF protection). Login is rate-limited and gives the same message for "wrong email" and "wrong password". Changing the password bumps a `tokenVersion`, which signs out every old session.

**How do you stop one user seeing another's data?**
Every query includes `userId` from the verified token, and IDs from another user simply return 404. There's an integration test where user B tries to read, edit, consume and delete user A's item and is refused every time.

**How does the run-out forecast work? Is it machine learning?**
It's a simple, explainable statistic: average daily consumption over the last 30 days (at least two records, at least a 7-day window), then stock divided by daily rate. It's labelled as an estimate with a confidence level. A next step would be weighting recent days more (exponential smoothing) or seasonality.

**How are recipe suggestions chosen?**
They're rule-based. Each recipe has ingredient keywords, and pantry item names are matched against them. Recipes score higher for using *expiring* items. Expired items are never used. There's no AI that could invent ingredients.

**How does the recipe explorer and cook-along work?**
There are two sources. A built-in library of 39 recipes stores exact quantities per serving and a cooking action for every step. TheMealDB, a free online database, adds more dishes and their YouTube videos, and is cached for 6 hours. Online steps are free text, so a small rule set reads each step ("boil", "fry", "preheat the oven") and picks the matching animation and timer. The animations are SVG with CSS keyframes rather than video files, so they work offline, follow dark mode and stop for users who prefer reduced motion. Narration uses the browser's built-in speech synthesis. "I cooked this" converts recipe units to pantry units (600 g → 0.6 kg) and deducts stock First-Expiry-First-Out.

**How does the 3D shelf work, and isn't it heavy?**
It's React Three Fiber (React for three.js). Each jar is a real item: fill = share of shelf life left (purchase → expiry), colour = status. It's code-split, so the ~250 KB 3D chunk loads only on the dashboard and welcome page. There's a 2D fallback when WebGL isn't available or the scene fails, and it stops animating for “reduce motion”. Labels are normal HTML positioned each frame by projecting 3D points to the screen, which keeps them crisp and accessible.

**How is gamification kept honest?**
Points are calculated from real records, not stored counters, so they can't drift. Demo data is excluded. Each action has a daily cap, so adding and deleting items can't farm points. Only badges are stored, so they stay earned and are celebrated exactly once. The biggest rewards go to the behaviour the app exists for: using food before it expires (the “rescue” bonus).

**Why Prisma and PostgreSQL?**
The data is relational (users, categories, items, batches, usage), and PostgreSQL gives transactions, row locking, exact decimals and DATE types. Prisma gives type-safe queries and versioned migrations.

**How did you test it?**
Unit tests cover the pure logic (dates, statuses, units, FEFO, forecasts, CSV safety). Integration tests call the real API against a real PostgreSQL test database rebuilt from the migrations. Playwright runs full user flows on desktop and phone layouts. CI also checks that the migrations exactly match the schema.

**How does family sharing work without rewriting every query?**
Every pantry query was already filtered by `userId`. The auth middleware now resolves *whose pantry* a request works on: your own, or your household owner's, looked up on every request so removal takes effect instantly. The signed-in person is kept separately (`actorId`) for account, password, household and push actions. A view-only middleware blocks writes, and the activity log records the actor's name using Node's AsyncLocalStorage, so no route had to pass it along.

**How do phone notifications work?**
Web Push. The browser subscribes with the server's public VAPID key and the subscription is stored per device. The daily job sends one summary per household to every device and marks those alerts as pushed, so nothing repeats. Dead subscriptions (410 Gone) are deleted. The keys are generated once and stored in the database if none are configured.

**How is the Hindi/Kannada interface done?**
A small translation layer keyed by the English text. A MutationObserver translates text and accessible labels whenever React renders, with patterns for sentences that contain numbers or names. Components stay plain English, anything untranslated falls back to English, and user data (item names, typed values) is never touched. The trade-off versus wrapping every string in `t()` is less compile-time checking; the upside is the whole UI is covered with no risk to component code.

**What would you add next?**
Receipt OCR to add many items at once, translating recipe steps, email verification, and per-account login lockout.

## Where things are in the code
| Topic | File |
|---|---|
| Expiry status rules | `server/src/lib/status.ts` |
| FEFO deduction | `server/src/lib/fefo.ts`, `server/src/services/stock.ts` |
| Forecast | `server/src/lib/predictions.ts` |
| Notifications (no duplicates) | `server/src/services/notifications.ts` |
| Auth & cookies | `server/src/middleware/auth.ts`, `server/src/routes/auth.ts` |
| CSV import preview | `server/src/services/importer.ts` |
| Data model | `server/prisma/schema.prisma` |
| Recipe library & matching | `server/src/lib/recipes.ts` |
| Online recipes (TheMealDB) | `server/src/services/onlineRecipes.ts` |
| Cook-along player & animations | `client/src/components/CookAlong.tsx`, `CookScene.tsx` |
| Points, levels, badges | `server/src/services/gamification.ts` |
| 3D shelf | `client/src/components/three/PantryScene.tsx`, `Scene3D.tsx` |
| Rewards UI & celebrations | `client/src/pages/Rewards.tsx`, `components/game.tsx`, `Celebrate.tsx` |
| Freshness meter | `client/src/components/pantry-bits.tsx` |
| Add-item form | `client/src/components/ItemForm.tsx` |
| Family sharing | `server/src/routes/household.ts`, `server/src/middleware/auth.ts`, `client/src/components/HouseholdPanel.tsx` |
| Phone notifications | `server/src/services/push.ts`, `client/public/push-sw.js`, `client/src/components/PushCard.tsx` |
| Hindi & Kannada | `client/src/lib/i18n/` |
