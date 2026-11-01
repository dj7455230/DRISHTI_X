# DRISHTI-X — Comprehensive Troubleshooting & Diagnostic Manual

This manual provides rapid diagnostic procedures and solutions for common operational issues encountered during local development and deployment.

---

## 1. Port 8000 Address Already in Use (`[Errno 48]`)

- **Symptom:** Uvicorn startup fails with `ERROR: [Errno 48] Address already in use`.
- **Cause:** An orphaned background process or previous terminal tab is still bound to port 8000.
- **Resolution:**
  ```bash
  # Check PID bound to port 8000
  lsof -i :8000

  # Terminate process immediately
  lsof -ti :8000 | xargs kill -9
  ```

---

## 2. Backend Service Unavailable in Frontend UI

- **Symptom:** UI displays `"Backend connection failed: unable to reach DRISHTI-X API server at http://localhost:8000"`.
- **Cause:** FastAPI backend is stopped or failed during startup.
- **Resolution:**
  1. Confirm backend status: `curl -s http://localhost:8000/health`
  2. Start backend server:
     ```bash
     python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
     ```
  3. Ensure `frontend/.env.local` specifies `NEXT_PUBLIC_API_URL=http://localhost:8000`.

---

## 3. 404 on API Documentation (`/docs`)

- **Symptom:** Browser shows `404: This page could not be found` when accessing `/docs`.
- **Cause:** Previously, FastAPI docs were mounted only at `/api/docs` and Next.js had no rewrite rule.
- **Resolution:** Both servers are now configured:
  - Next.js rewrites `http://localhost:3000/docs` $\rightarrow$ `http://localhost:8000/api/docs`.
  - FastAPI redirects `http://localhost:8000/docs` $\rightarrow$ `/api/docs`.

---

## 4. Google OAuth Token Audience Mismatch

- **Symptom:** Sign-in fails with `"Google token audience mismatch"`.
- **Cause:** The Google Client ID in `.env` does not match the Client ID used by the frontend in `frontend/.env.local`.
- **Resolution:** Ensure identical values in both files:
  ```ini
  # .env
  GOOGLE_CLIENT_ID=433805525665-1k3toag11rt3n98csf523r96rro1j39r.apps.googleusercontent.com

  # frontend/.env.local
  NEXT_PUBLIC_GOOGLE_CLIENT_ID=433805525665-1k3toag11rt3n98csf523r96rro1j39r.apps.googleusercontent.com
  ```

---

## 5. PostgreSQL Connection Error Fallback

- **Symptom:** Local PostgreSQL server is stopped or port 5432 is unavailable.
- **Resolution:** DRISHTI-X automatically detects this and falls back to SQLite at `retinatrust.db` in the project root. To restore PostgreSQL:
  ```bash
  brew services restart postgresql@14
  ```

---

## 6. "Screening Not Found" Error (`HTTP 404`)

- **Symptom:** API returns `{"detail": "Screening not found."}` or UI shows "Screening Examination Not Found".
- **Causes & Diagnostics:**
  1. **Case Number vs. UUID lookup:** Accessing an endpoint with a case number (`DX-CASE-YYYYMM-XXXXXX`) or short 8-character ID prefix.
     - *Status:* DRISHTI-X now natively supports both full UUIDs, case numbers, and prefix lookups seamlessly in `_get_screening_or_404`.
  2. **Stale Local Draft State:** Browser localStorage cached an `activeScreeningId` from a previously reset database.
     - *Resolution:* Clear browser localStorage or click "Start New Screening". The frontend wizard now automatically auto-heals and clears stale draft IDs if a 404 is encountered.
  3. **Case Not Synced From Rural Offline Node:** If screening was recorded on an offline PHC device, verify that it has been synchronized in the **Offline Sync Center** (`/offline-sync`).

---

## 7. Model Lab Evaluation Metrics (`quadratic_weighted_kappa.toFixed`)

- **Symptom:** TypeError: `undefined is not an object (evaluating 'classification.metrics.quadratic_weighted_kappa.toFixed')`.
- **Cause:** Discrepancy between raw artifact JSON schemas (nested `multiclass` and `binary_referable` blocks) and frontend direct property access.
- **Resolution:**
  - Backend [`backend/app/api/routes/evaluation.py`](file:///Users/devanshjain06/Desktop/aictr/backend/app/api/routes/evaluation.py) now enriches evaluation bundles with top-level convenience aliases (`accuracy`, `quadratic_weighted_kappa`, `macro_f1`, `mean_lesion_dice`, `confusion_matrix`) while strictly preserving nested artifact structure.
  - Frontend [`frontend/app/(app)/model-lab/page.tsx`](file:///Users/devanshjain06/Desktop/aictr/frontend/app/(app)/model-lab/page.tsx) uses defensive `formatPct()` and `formatNum()` helpers that safely navigate nested and flat objects without ever calling `.toFixed()` on `undefined`.

---

## 8. Judge Demo Portal Scenario Key Mismatch (`activeScenario.code`)

- **Symptom:** Runtime TypeError: `undefined is not an object (evaluating 'activeScenario.code')`.
- **Cause:** Backend `GET /api/screenings/demo/scenarios` returns an array `scenarios: [...]` of curated scenario objects (with IDs `scenario_a_validated`, `scenario_b_mismatch`, `scenario_c_poor_quality`), whereas the frontend expected a dictionary keyed by `scenario_a`, `scenario_b`, `scenario_c`. Indexing an Array with string `"scenario_a"` evaluated to `undefined`.
- **Resolution:**
  - Frontend [`frontend/app/(app)/demo/page.tsx`](file:///Users/devanshjain06/Desktop/aictr/frontend/app/(app)/demo/page.tsx) normalized scenario loading to parse both Array and Object backend formats, mapping scenario keys (`SCENARIO_A`, `SCENARIO_B`, `SCENARIO_C`) to `scenario_a`, `scenario_b`, `scenario_c`.
  - Added safe optional chaining (`activeScenario?.code`, `activeScenario?.name`, `activeScenario?.quality?.status`, etc.) and guaranteed fallback to `fallbackScenarios.scenario_a` to prevent runtime crashes.




