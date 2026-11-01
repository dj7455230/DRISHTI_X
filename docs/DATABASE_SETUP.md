# DRISHTI-X — PostgreSQL & Database Setup Guide

This document describes the relational database architecture, entity schema, migrations, and zero-configuration SQLite fallback for DRISHTI-X.

---

## 1. Database Architecture & Engine Configuration

DRISHTI-X implements a dual-mode database engine in [`backend/app/db/base.py`](file:///Users/devanshjain06/Desktop/aictr/backend/app/db/base.py):

1. **Primary Database: PostgreSQL (Port 5432)**
   - Production relational engine utilizing connection pooling (`pool_size=5`, `max_overflow=10`, `pool_pre_ping=True`).
   - Stores real clinical screening encounters, cryptographic audit logs, and longitudinal patient histories.
2. **Zero-Configuration SQLite Fallback (`retinatrust.db`)**
   - Automatically activates if PostgreSQL is offline or unreachable.
   - Points to an absolute path in the project root to guarantee data continuity across working directories.

---

## 2. Entity Relational Model (14 Core Tables)

```
+--------------------+         +------------------------+         +-----------------------+
|       users        |         |        patients        |         |      screenings       |
|--------------------|         |------------------------|         |-----------------------|
| id (UUID, PK)      |<-------+| id (UUID, PK)          |<-------+| id (UUID, PK)         |
| email (Unique)     |         | patient_code (Unique)  |         | case_number (Unique)  |
| role (Enum)        |         | name, age, dob, gender |         | patient_id (FK)       |
| hashed_password    |         | diabetes_type, duration|         | created_by (FK)       |
| full_name          |         | hba1c_value, glucose   |         | status (Enum)         |
| facility_name      |         | blood_pressure         |         | eye_side (LEFT/RIGHT) |
| google_id          |         | pin_code, state        |         | priority_level, score |
+--------------------+         +------------------------+         +-----------+-----------+
                                                                              |
         +--------------------+---------------------+-------------------------+
         |                    |                     |                         |
         v                    v                     v                         v
+------------------+ +------------------+ +-------------------+ +-------------------------+
|  fundus_images   | |   predictions    | |  doctor_reviews   | |         reports         |
|------------------| |------------------| |-------------------| |-------------------------|
| id (UUID, PK)    | | id (UUID, PK)    | | id (UUID, PK)     | | id (UUID, PK)           |
| screening_id (FK)| | screening_id (FK)| | screening_id (FK) | | screening_id (FK)       |
| original_path    | | predicted_grade  | | reviewer_id (FK)  | | pdf_path                |
| enhanced_path    | | confidence (0-1) | | doctor_grade      | | json_data               |
| thumbnail_path   | | probabilities    | | action (ACCEPT...) | | checksum                |
| quality_score    | | gradcam_path     | | doctor_notes      | | generated_at            |
| focus_score      | | lesion_mask_path | | reviewed_at       | +-------------------------+
| is_gradable      | | mismatch_detected| +-------------------+
+------------------+ +------------------+
```

---

## 3. Database Schema Entities & Roles

1. **`users`:** Clinicians, Ophthalmologists, Health Workers, and Administrators.
2. **`patients`:** Comprehensive demographic, glycemic, and ophthalmic patient profiles.
3. **`screenings`:** Screening encounters with case numbering and clinical context.
4. **`fundus_images`:** Uploaded retinal photographs, enhanced variants, thumbnails, and OpenCV quality metrics.
5. **`predictions`:** EfficientNet-B0 grades, U-Net lesion summaries, Grad-CAM overlays, and evidence concordance decisions.
6. **`doctor_reviews`:** Independent doctor assessments, clinical notes, and override actions.
7. **`doctor_review_actions`:** Append-only history of review actions (ACCEPT, REFER, RECAPTURE).
8. **`referrals`:** Specialist referral routing records with priority triage tags.
9. **`reports`:** Generated PDF screening reports and JSON data capsules.
10. **`audit_logs`:** Tamper-evident SHA-256 blockchain audit trail.
11. **`analysis_jobs`:** Persistent 11-stage background inference execution states.
12. **`evidence_capsules`:** Compact JSON capsules for rural offline transmission.
13. **`sync_queue_records`:** Priority-aware rural batch synchronization queue.
14. **`model_versions`:** Traceability records for all deployed PyTorch models.

---

## 4. Local PostgreSQL Setup (macOS & Linux)

### Start PostgreSQL with Homebrew:
```bash
brew services start postgresql@14
createdb drishti_x
```

### Connection String:
```ini
DATABASE_URL=postgresql://postgres:062006@localhost:5432/drishti_x
```

### Verification Query:
```bash
python3 -c "
import sqlalchemy
from app.db.base import engine
with engine.connect() as conn:
    print('Connected successfully to:', engine.url)
"
```

