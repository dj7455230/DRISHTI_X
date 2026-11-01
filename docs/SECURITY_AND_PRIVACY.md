# DRISHTI-X — Cybersecurity, Role-Based Access & Patient Privacy Policy

This document details the cybersecurity controls, authentication mechanisms, patient privacy protections, and cryptographic audit logging in DRISHTI-X.

---

## 1. Role-Based Access Control (RBAC)

DRISHTI-X enforces three distinct clinical roles:

| Capability / Endpoint | Health Worker | Ophthalmologist | Administrator |
|---|:---:|:---:|:---:|
| **Register Patients** | Yes | Yes | Yes |
| **Create Screening Case** | Yes | Yes | Yes |
| **Upload Retinal Fundus Image** | Yes | Yes | Yes |
| **View Image Quality Feedback** | Yes | Yes | Yes |
| **Receive Recapture Guidance** | Yes | Yes | Yes |
| **Request Priority Referral** | Yes | Yes | Yes |
| **Inspect AI Predictions & Grad-CAM** | Limited | Yes | Yes |
| **Submit Doctor Clinical Review & Override** | No | **Yes** | **Yes** |
| **Final Clinical Adjudication** | No | **Yes** | **Yes** |
| **Download PDF Clinical Report** | Limited | Yes | Yes |
| **Audit Log Inspection & Ledger Validation** | No | No | **Yes** |
| **Judge Scenario Reset / Demo Admin** | No | No | **Yes** |

---

## 2. Authentication & Credential Protections

1. **Password Hashing:** Passwords hashed with `passlib` using bcrypt and PBKDF2 with unique salts.
2. **JWT Security:** Stateless bearer tokens signed with HS256 (`SECRET_KEY`), expiring after 8 hours.
3. **Google OAuth 2.0:** Verified using `google-auth` library against Google's public certificates. Tokens are validated for issuer (`accounts.google.com`), expiration, and audience (`GOOGLE_CLIENT_ID`). Account collisions are protected by verifying email ownership.
4. **CORS Isolation:** CORS origin matching validates strict protocols and hostnames (`http://localhost:3000`, `http://127.0.0.1:3000`, production frontend domain). Trailing slashes are normalized to prevent origin bypasses.

---

## 3. Patient Privacy & Data Minimization (HIPAA / DISHA)

1. **De-Identification & Anonymous Screenings:**
   - Supports anonymous screening encounters where name and contact information are omitted.
   - De-identified synthetic identifiers (`PAT-XXXXXX`) replace direct personal identifiers.
2. **Log Privacy:**
   - Patient names, contact numbers, and health records are never printed to stdout, console logs, or file logs.
3. **Secure File Storage:**
   - Uploaded fundus images are assigned UUID filenames, preventing path traversal attacks (`../`).
   - Image hashes (SHA-256) are computed upon upload to verify file integrity.

---

## 4. Tamper-Evident SHA-256 Audit Trail

All sensitive clinical transactions (intake, image upload, AI prediction, doctor review, report generation) are recorded in the `audit_logs` table using cryptographic hash-chaining:

$$\text{Hash}_i = \text{SHA-256}(\text{ID}_i \parallel \text{Timestamp}_i \parallel \text{Action}_i \parallel \text{Actor}_i \parallel \text{Hash}_{i-1})$$

Administrators can verify the entire ledger via `GET /api/admin/audit-chain`. Any manual database alteration immediately invalidates the cryptographic chain.

