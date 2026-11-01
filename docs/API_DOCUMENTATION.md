# DRISHTI-X — REST API Specification & Endpoint Documentation

**Base URL:** `http://localhost:8000`  
**Interactive Swagger UI:** `http://localhost:8000/docs` (or `http://localhost:8000/api/docs`)  
**ReDoc Reference:** `http://localhost:8000/redoc`  
**OpenAPI Specification:** `http://localhost:8000/api/openapi.json`  

---

## 1. Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Description | Role Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new clinical user account | Public |
| `POST` | `/api/auth/login` | Authenticate with email/password; returns JWT | Public |
| `POST` | `/api/auth/google` | Verify Google ID token & sign in / register | Public |
| `POST` | `/api/auth/google/link` | Link existing email/password account to Google | Public |
| `GET` | `/api/auth/me` | Fetch active authenticated user profile | Authenticated |
| `GET` | `/api/auth/permission-matrix` | Return RBAC feature access permissions | Authenticated |

---

## 2. Patient Management Endpoints (`/api/patients`)

| Method | Endpoint | Description | Role Required |
|---|---|---|---|
| `POST` | `/api/patients` | Register patient with full clinical demographics | Health Worker, Doctor, Admin |
| `POST` | `/api/patients/check-duplicate` | Match name, contact, and DOB to prevent duplicate profiles | Authenticated |
| `GET` | `/api/patients` | Paginated patient list with search and filter | Authenticated |
| `GET` | `/api/patients/{id}` | Retrieve patient details and screening history count | Authenticated |
| `PUT` | `/api/patients/{id}` | Update patient demographics or medical profile | Authenticated |
| `GET` | `/api/patients/{id}/screenings` | Retrieve all screening encounters for patient | Authenticated |
| `GET` | `/api/patients/{id}/compare` | Longitudinal comparison between two screenings | Doctor, Admin |

---

## 3. Screening Workflow Endpoints (`/api/screenings`)

| Method | Endpoint | Description | Role Required |
|---|---|---|---|
| `POST` | `/api/screenings/intake` | **Atomic Intake:** Registers patient + creates case in 1 transaction | Health Worker, Doctor, Admin |
| `POST` | `/api/screenings` | Initialize standalone screening case | Health Worker, Doctor, Admin |
| `GET` | `/api/screenings` | Filterable list of screenings by status and priority | Authenticated |
| `GET` | `/api/screenings/{id}` | Retrieve complete screening encounter record | Authenticated |
| `PATCH` | `/api/screenings/{id}` | Update screening clinical context or laterality | Authenticated |
| `POST` | `/api/screenings/{id}/image` | Upload fundus photograph (JPG, PNG, TIFF, BMP) | Authenticated |
| `POST` | `/api/screenings/{id}/quality-check` | Execute OpenCV image quality gate assessment | Authenticated |
| `POST` | `/api/screenings/{id}/analyze` | Run EfficientNet-B0 + U-Net + Grad-CAM inference | Authenticated |
| `POST` | `/api/screenings/{id}/doctor-review` | Submit ophthalmologist clinical review & notes | Doctor, Admin |
| `POST` | `/api/screenings/{id}/action` | Submit formal review action (ACCEPT, REFER, RECAPTURE) | Doctor, Admin |

---

## 4. Reports & Diagnostic Endpoints

| Method | Endpoint | Description | Role Required |
|---|---|---|---|
| `POST` | `/api/reports/{screening_id}/generate` | Generate 17-section PDF screening report | Authenticated |
| `GET` | `/api/reports/{screening_id}/pdf` | Download generated PDF report binary | Authenticated |
| `GET` | `/api/reports/{screening_id}/data` | Fetch comprehensive JSON clinical summary | Authenticated |
| `GET` | `/api/referrals/priority-queue` | Triage queue sorted by priority score (CRITICAL first) | Doctor, Admin |
| `GET` | `/api/admin/audit-chain` | Verify cryptographic SHA-256 audit ledger | Admin |
| `GET` | `/api/engine/matlab` | Check MATLAB engine connection & capabilities | Authenticated |
| `GET` | `/api/evaluation/cross-dataset` | External validation metrics on Messidor-2 | Doctor, Admin |

