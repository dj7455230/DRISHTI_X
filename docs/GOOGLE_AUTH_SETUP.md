# DRISHTI-X — Google Sign-In & OAuth 2.0 Setup Guide

This document describes how to configure Google Identity Services (GIS) and Google OAuth 2.0 for DRISHTI-X.

---

## 1. Overview of Authentication Architecture

DRISHTI-X uses **Google Identity Services (GIS)** with **Backend ID Token Verification**:

1. **Frontend**: The official Google Sign-In button is rendered via Google Identity Services (`https://accounts.google.com/gsi/client`). When the user authenticates, Google returns an OpenID Connect ID token (JWT) to the callback.
2. **Backend**: The frontend sends the credential to `POST /api/auth/google`. The backend validates the cryptographic signature against Google's public JWKS certificates using the official `google-auth` library (`google.oauth2.id_token.verify_oauth2_token`).
3. **Audience & Issuer Check**: The backend verifies that the token was issued by Google (`iss: accounts.google.com`) and addressed to this application's `GOOGLE_CLIENT_ID` (`aud`).
4. **Identity Linking & User Model**:
   - If the user already has a Google identity (`google_id`), DRISHTI-X logs them in directly, preserving their clinical role (`HEALTH_WORKER`, `OPHTHALMOLOGIST`, `ADMIN`) and patient screening history.
   - If the user has an existing account registered with email/password, DRISHTI-X returns `409 Conflict` to prevent insecure automatic account takeover. The user can securely link their Google account by confirming their existing password via `POST /api/auth/google/link`.
   - If no account exists, a new account is registered with the default clinical role `HEALTH_WORKER` (**never ADMIN**).
5. **Session Management**: DRISHTI-X issues a signed JWT access token and sets an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie (`drishti_session`).

---

## 2. Google Cloud Console Setup

### Step 1: Create or Select a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown in the top navigation bar and select **New Project**.
3. Name your project (e.g. `drishti-x-platform`) and click **Create**.

### Step 2: Configure the OAuth Consent Screen
1. In the left sidebar, navigate to **APIs & Services** > **OAuth consent screen**.
2. Select User Type:
   - **External** (standard for web users and external clinical practitioners).
   - Click **Create**.
3. Fill in the App Information:
   - **App name**: `DRISHTI-X Retinal Screening`
   - **User support email**: Your support or administrator email.
   - **Developer contact information**: Your contact email.
4. Click **Save and Continue**.
5. Scopes:
   - Click **Add or Remove Scopes**.
   - Select:
     - `.../auth/userinfo.email` (`openid`, `email`)
     - `.../auth/userinfo.profile` (`profile`)
   - Click **Update** and **Save and Continue**.
6. Test Users (while in Testing mode):
   - Add the Google accounts you will use for local testing.
7. Click **Save and Continue**.

### Step 3: Create Web OAuth 2.0 Client ID
1. In the left sidebar, navigate to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Under **Application type**, choose **Web application**.
4. Name: `DRISHTI-X Web Client`.
5. **Authorized JavaScript origins**:
   Add both local development and production URLs (do **not** include trailing slashes):
   - **Local Development**:
     - `http://localhost:3000`
     - `http://127.0.0.1:3000`
   - **Production (Vercel / Custom Domain)**:
     - `https://your-frontend.vercel.app`
     - `https://www.drishti-x.com`
6. **Authorized redirect URIs**:
   - `http://localhost:3000/login`
   - `https://your-frontend.vercel.app/login`
7. Click **Create**.
8. Copy your **Client ID** (format: `<project-number>-<unique-hash>.apps.googleusercontent.com`).
   *(Note: The client secret is NOT required or exposed in the frontend).*

---

## 3. Environment Variable Configuration

### Frontend Configuration (`frontend/.env.local`)
Add the Web Client ID to your frontend environment:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

### Backend Configuration (`backend/.env`)
Add the exact same Client ID to your backend environment:
```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

### Production Deployment Variables
- **Vercel (Frontend)**:
  - Settings > Environment Variables:
    - `NEXT_PUBLIC_API_URL`: Your deployed backend URL (e.g. `https://drishti-x-api.onrender.com`)
    - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
- **Render (Backend)**:
  - Environment > Environment Variables:
    - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
    - `FRONTEND_URL`: `https://your-frontend.vercel.app`

---

## 4. Security Principles Enforced

1. **Zero Client Trust**: User profile data (name, email, avatar) is never accepted directly from client-sent JSON. It is strictly extracted from the cryptographically verified Google ID token on the server.
2. **Account Takeover Protection**: If a user previously registered with email/password, Google sign-in with the same email will **not** automatically link or overwrite the account. It returns a `409 Conflict` requiring password confirmation to securely link the identity.
3. **Privilege Isolation**: Any user created via Google OAuth is registered with the base clinical role `HEALTH_WORKER`. Admin or specialist permissions must be granted deliberately by an existing clinical administrator.
4. **Session Hygiene**: Access tokens are sent as Bearer tokens in API requests and set as `HttpOnly`, `SameSite=Lax` cookies with `Secure` flags in production environments.
5. **Secret Protection**: OAuth Client Secrets and backend cryptographic keys are strictly server-side and never exposed to client-side bundles.

---

## 5. Verification & Testing

To run the automated authentication test suite:
```bash
pytest tests/test_google_auth.py -v
```

To run all backend tests:
```bash
pytest
```

To verify the frontend production build:
```bash
npm --prefix frontend run build
```

