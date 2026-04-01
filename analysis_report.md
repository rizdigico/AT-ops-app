# Application Analysis & Gap Report: AT Ops App

This report compares the current implementation of the **Automated Airport Transfer Dispatch System** against the requirements outlined in `PROJECT_REQUIREMENTS.md`.

## 📊 High-Level Status
| Category | Requirement Status |
| :--- | :--- |
| **Frontend UI** | 🟢 Layout/Components Build (Skeleton) |
| **Excel Data Import** | 🔴 UI Only (No Parsing Logic) |
| **Database (Supabase)** | 🔴 Missing |
| **Flight Tracking (Aviationstack)** | 🔴 Missing |
| **WhatsApp Notifications (CallMeBot)** | 🔴 Missing |
| **Automation (Vercel Cron)** | 🔴 Missing |
| **Core Logic (TZ/Terminal Map)** | 🔴 Missing |

---

## 🏗️ Detailed Gap Analysis

### 1. Frontend (UI & UX)
While the visual shell is highly impressive (vibrant aesthetics, kinetic stats, 3D elements), the functional "plumbing" is absent.

*   **[MISSING] Real Data Binding:** The dashboard currently pulls from `store/useAppStore.ts` which contains static `mockData`. It is not connected to any external database or API.
*   **[MISSING] Excel Parsing Integration:** The `ScheduleUploader` component is a mock. It simulates a 1.5s delay and shows a "Success" state without actually reading the file content or validating columns (Date, file ref, flight details, etc.).
*   **[MISSING] Terminal Mapping Visualization:** The PRD requires assigning terminals (T1-T4) based on airline/agent. While the `Flight` type has a `terminal` field, there is no logic to auto-calculate this from the agent/flight number.
*   **[PARTIAL] Mobile Optimization:** The layout uses Tailwind and is responsive, but hasn't been tested with real-time data flows or large lists.

### 2. Backend (Next.js & Supabase)
Currently, there is **no backend infrastructure** implemented beyond the basic Next.js structure.

*   **[MISSING] Supabase Integration:** No `@supabase/supabase-js` dependency or client initialization. There are no tables for `flights` as defined in Section 4 of the PRD.
*   **[MISSING] API Routes:** Next.js API routes (e.g., `/api/upload`, `/api/flights/sync`) are missing.
*   **[MISSING] Excel/CSV Parser:** Packages like `xlsx` or `papaparse` are not installed or used.
*   **[MISSING] Cron Job Support:** No `vercel.json` file exists to register the 15-minute background check for flight delays.

### 3. API Integrations
*   **[MISSING] Aviationstack (Flight Data):** No code exists to poll flights scheduled to land within 4 hours.
*   **[MISSING] CallMeBot (WhatsApp):** No trigger logic for arrivals (60m prior) or status changes (cancellations/delays >30m).
*   **[MISSING] Change Detection:** No logic to compare `estimated_arrival` vs stored `ETA` to trigger updates or alerts.

### 4. Core Logic & Compliance
*   **[MISSING] Timezone Enforcement:** Although `date-fns` is installed, no utility functions are visible that strictly enforce `Asia/Singapore` (GMT+8) for all data entry and polling.
*   **[MISSING] Terminal Logic:** The mapping dictionary (e.g., Singapore Airlines -> T2/T3) is not implemented.
*   **[MISSING] Notification Flagging:** No mechanism to set or check the `notified: boolean` flag to prevent duplicate messages.

---

## 🚩 Critical Missing Pieces (PRD Satisfaction)

### A. Data Schema Definition (Section 4)
The database must support specific fields like `pax_count`, `flight_number`, `driver_info`, and `notified`. Currently, these exist only as TypeScript interfaces and mock objects, not persistent database columns.

### B. Execution Steps (Section 6)
Steps 2 through 7 of the PRD walkthrough have not been started:
1.  ~~Initialize project~~ (Done)
2.  Build Upload Component (Uploader UI done, **Logic missing**)
3.  Write Timezone/Terminal utilities (**Missing**)
4.  Set up Supabase (**Missing**)
5.  Aviationstack/CallMeBot fetchers (**Missing**)
6.  Vercel Cron setup (**Missing**)
7.  Deploy and Test (**Missing**)

---

## ⚡ Suggestions & Next Steps
1.  **Initialize Supabase:** Add `@supabase/supabase-js` and create the `flights` table based on the schema in Section 4.
2.  **Install Parser:** Add `xlsx` and implement the file reading logic in a Next.js API route.
3.  **Implement Utilities:** Create `src/lib/flight-utils.ts` for terminal mapping and timezone conversion.
4.  **Register Cron:** Create `vercel.json` and a corresponding API route to handle flight polling and notification triggers.
5.  **Environment Variables:** Secure the API keys provided in the PRD (Aviationstack, CallMeBot) in a `.env.local` file.
