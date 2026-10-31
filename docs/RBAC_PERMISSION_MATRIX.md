# DRISHTI-X — Role-Based Access Control (RBAC) Matrix

**Security Standard:** Multi-Tier Clinical Healthcare Authorization  
**Enforcement:** Backend Dependency Injection (`backend/app/api/deps.py`) + Client UI Gating  

---

## 1. Clinical Role Taxonomy

| Role | Target Persona | Primary Responsibility |
| :--- | :--- | :--- |
| `HEALTH_WORKER` | ASHA worker, ANM, primary clinic nurse | Patient intake, fundus imaging, image quality gate verification, recapture guidance, submit cases |
| `OPHTHALMOLOGIST` | Retina specialist, consultant ophthalmologist | Review screening cases, inspect Grad-CAM & lesion masks, confirm/modify grade, sign-off reviews |
| `ADMIN` | Hospital IT admin, clinical director | User creation, role assignment, system health monitoring, audit trail inspection |

---

## 2. API Endpoint Permission Matrix

| Endpoint | Method | Health Worker | Ophthalmologist | Administrator | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `/api/auth/login` | POST | Allow | Allow | Allow | Authenticate credentials & issue JWT |
| `/api/auth/logout` | POST | Allow | Allow | Allow | Invalidate session & record audit log |
| `/api/auth/me` | GET | Allow | Allow | Allow | Fetch authenticated user profile |
| `/api/patients` | GET | Allow | Allow | Allow | Search patient directory |
| `/api/patients` | POST | Allow | Allow | Allow | Register new clinical patient record |
| `/api/patients/{id}` | GET | Allow | Allow | Allow | View patient record & screening history |
| `/api/patients/{id}` | PUT | Allow | Allow | Allow | Update patient demographics/diabetes info |
| `/api/patients/check-duplicate` | POST | Allow | Allow | Allow | Check for duplicate records |
| `/api/screenings/intake` | POST | Allow | Allow | Allow | Create patient + screening atomically |
| `/api/screenings/{id}/image` | POST | Allow | Allow | Allow | Upload fundus photograph |
| `/api/screenings/{id}/quality-check` | POST | Allow | Allow | Allow | Run automated image quality gate |
| `/api/screenings/{id}/analyze` | POST | Allow | Allow | Allow | Run AI DR classification & Grad-CAM |
| `/api/screenings/{id}/doctor-review` | POST | Deny (403) | **Allow** | **Allow** | Record official ophthalmologist sign-off |
| `/api/screenings/{id}/recapture` | POST | Allow | Allow | Allow | Trigger image recapture request |
| `/api/screenings/{id}/report` | GET/POST | Allow | Allow | Allow | Generate / read clinical screening report |
| `/api/screenings/{id}/report/pdf` | GET | Allow | Allow | Allow | Download branded clinical PDF report |
| `/api/admin/users` | GET | Deny (403) | Deny (403) | **Allow** | List system users |
| `/api/admin/users` | POST | Deny (403) | Deny (403) | **Allow** | Create authorized clinician accounts |
| `/api/admin/users/{id}` | PATCH | Deny (403) | Deny (403) | **Allow** | Update user role or active status |
| `/api/admin/audit-logs` | GET | Deny (403) | Deny (403) | **Allow** | Read tamper-evident audit logs |
| `/api/admin/stats` | GET | Deny (403) | Deny (403) | **Allow** | Monitor administrative system metrics |

---

## 3. Seed Test Accounts for Demonstration

| Role | Email | Password | Facility / Title |
| :--- | :--- | :--- | :--- |
| **Health Worker** | `worker@drishti.org` | `worker123` | Sita Patel, Primary Health Centre - Rampur |
| **Ophthalmologist** | `doctor@drishti.org` | `doctor123` | Dr. Ramesh Gupta, MS (Ophth), Apex Eye Hospital |
| **Ophthalmologist** | `testdoc@example.com` | `doctor123` | Dr. Ramesh Gupta, MS (Ophth), Apex Eye Hospital |
| **Administrator** | `admin@drishti.org` | `admin123` | DRISHTI-X Command Center Systems Administrator |

