# DRISHTI-X — How to Run

## Prerequisites (already installed on your machine)
- Python 3.14 ✓
- Node.js 24 ✓
- PostgreSQL 18 (EnterpriseDB at `/Library/PostgreSQL/18`) ✓
- PyTorch 2.12 + timm + OpenCV ✓

---

## Step 1 — Create the Database (one time only)

Open a terminal and run:

```bash
cd drishti-x
python3 scripts/setup_database.py
```

When prompted:
- Host: `localhost`
- Port: `5432`
- Superuser: `postgres`
- Password: *(your postgres password)*
- DB name: `drishti_x`

Then create an admin user when asked (you'll use this to log in).

**OR** — if you know the postgres password, update `backend/.env` manually:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/drishti_x
```
Then create the DB manually:
```bash
/Library/PostgreSQL/18/bin/psql -U postgres -c "CREATE DATABASE drishti_x;"
```

---

## Step 2 — Start the Backend

Open **Terminal 1** and run:

```bash
cd /Users/devanshjain06/Desktop/eye/drishti-x

export PYTHONPATH="$(pwd)/backend:$(pwd)"

uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  --app-dir backend
```

You should see:
```
  DRISHTI-X v0.1.0
  Environment: development
  Model Status: TRAINED
  INFO: Application startup complete.
```

API docs available at: **http://localhost:8000/api/docs**

---

## Step 3 — Start the Frontend

Open **Terminal 2** and run:

```bash
cd /Users/devanshjain06/Desktop/eye/drishti-x/frontend
npm run dev
```

You should see:
```
  ▲ Next.js 16.3.4
  - Local: http://localhost:3000
```

Open: **http://localhost:3000**

---

## Step 4 — Register and Login

1. Go to **http://localhost:3000/register**
2. Fill in name, email, password, select role (OPHTHALMOLOGIST for full access)
3. Login at **http://localhost:3000/login**

---

## Step 5 — Run a Screening (Full Workflow)

1. Click **New Screening** in the sidebar
2. Enter patient age → click **Create Patient & Continue**
3. Upload a retinal fundus image → click **Upload & Continue**
4. Click **Run AI Analysis**
5. See:
   - Real DR grade (0–4) from trained EfficientNet-B0
   - Real confidence probabilities
   - Real Grad-CAM heatmap
   - Lesion evidence
   - Assurance decision (VALIDATED / HUMAN_REVIEW_REQUIRED / RECAPTURE_REQUIRED)
   - Referral priority score

---

## Step 6 — Doctor Review (needs OPHTHALMOLOGIST role)

1. Go to **Doctor Review** in sidebar
2. Open a case flagged HUMAN_REVIEW_REQUIRED
3. Set your own grade (0–4)
4. Accept or override the AI prediction
5. Add clinical notes
6. Submit

---

## Optional — Continue Training

```bash
cd /Users/devanshjain06/Desktop/eye/drishti-x
python3 -u training/train_efficientnet.py
```

Current best: **Epoch 1 — ROC-AUC 98.2%, Specificity 96.1%, Sensitivity 87.7%**
Training for 30 epochs should reach Sensitivity >90%.

---

## Optional — Train U-Net Lesion Segmentation

```bash
python3 training/train_unet.py
```

Requires IDRiD segmentation masks (already downloaded at `datasets/idrid/A. Segmentation/`).

---

## Run All Tests

```bash
cd /Users/devanshjain06/Desktop/eye/drishti-x
python3 -m pytest tests/ -v
# Expected: 61 passed
```

---

## Quick Shortcut (both servers at once)

```bash
cd /Users/devanshjain06/Desktop/eye/drishti-x
bash start.sh
```

This opens two Terminal windows automatically.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `psycopg2 connection refused` | Check `backend/.env` DATABASE_URL has correct postgres password |
| `ModuleNotFoundError` | Make sure `PYTHONPATH` is set before running uvicorn |
| `Model not loading` | Check `models/weights/best_model.pth` exists |
| `Port 8000 in use` | `kill $(lsof -ti:8000)` |
| `Port 3000 in use` | `kill $(lsof -ti:3000)` |
| Frontend shows "Failed to load" | Backend not running — start Terminal 1 first |
