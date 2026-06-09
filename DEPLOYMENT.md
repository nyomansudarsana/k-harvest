# Kopernik Harvest — Free Deployment Guide

Deploy the application to a live public URL at zero cost using **Render** (backend) and **Vercel** (frontend).

---

## Architecture

```
Stakeholder browser
       │
       ├─── https://kopernik-harvest.vercel.app  ──→  Vercel (React static site)
       │                                                    │
       │                                                    │  VITE_API_URL
       │                                                    ▼
       └─── https://kh-backend.onrender.com      ──→  Render (FastAPI + Docker)
                                                            │
                                                            │  SQLite (embedded)
                                                            │  seed.py on startup
                                                            ▼
                                                       Fresh demo data every cold start
```

**Total cost: $0/month**

---

## Important Behaviour on Render Free Tier

Render free web services **sleep after 15 minutes of inactivity**. When the first request arrives after sleep, it takes approximately 30–60 seconds to wake up. Subsequent requests are instant.

**For demos:** Open the backend URL in a browser 2–3 minutes before your meeting to pre-warm the service.

The SQLite database is **ephemeral** on Render — data is reset every time the container restarts or a new deployment is pushed. Because `seed.py` runs automatically on every startup, your demo data (8 products, 5 suppliers, 5 batches) is always present and consistent. Any data created during the demo will be gone after the next restart.

---

## Step 1 — Prepare Your Repository

### 1.1 Verify these files exist

Confirm the following files are in your repository:

```
├── .gitignore                      ← excludes .env, venv, node_modules, *.db
├── render.yaml                     ← Render deployment blueprint
├── backend/
│   ├── .env.example                ← safe template (no secrets)
│   ├── Dockerfile                  ← uses ${PORT:-8000}
│   └── requirements.txt
└── frontend/
    ├── vercel.json                 ← SPA routing fix
    ├── package.json
    └── vite.config.js
```

### 1.2 Ensure `.env` is NOT committed

```bash
git status
```

If `backend/.env` or `backend/kopernik_harvest.db` appear as tracked files, remove them:

```bash
git rm --cached backend/.env
git rm --cached backend/kopernik_harvest.db
git commit -m "Remove secrets and database from version control"
```

### 1.3 Push all changes to GitHub

```bash
git add .
git commit -m "Add deployment configuration for Render and Vercel"
git push origin main
```

---

## Step 2 — Deploy the Backend on Render

### 2.1 Create a Render account

Go to **https://render.com** → Sign Up → connect with your GitHub account.

### 2.2 Create a new Web Service

1. From the Render dashboard, click **New +** → **Web Service**
2. Click **Connect a repository** → authorize GitHub → select your `kopernik-harvest` repository
3. Click **Connect**

### 2.3 Configure the service

Fill in the following fields:

| Field | Value |
|---|---|
| **Name** | `kh-backend` |
| **Region** | Singapore (closest to Indonesia) or Oregon |
| **Branch** | `main` |
| **Runtime** | **Docker** |
| **Dockerfile Path** | `./backend/Dockerfile` |
| **Docker Context** | `./backend` |
| **Instance Type** | **Free** |

> Render auto-detects `render.yaml` — if prompted to use it, click **Yes**.

### 2.4 Add environment variables

In the **Environment** section, add these key-value pairs:

| Key | Value | Notes |
|---|---|---|
| `SECRET_KEY` | *(click Generate)* | Render can generate a secure random value |
| `ALGORITHM` | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | |
| `DATABASE_URL` | `sqlite:///./kopernik_harvest.db` | |
| `DEBUG` | `false` | |
| `CORS_ORIGINS` | `http://localhost:3000` | Update after Step 3 with your Vercel URL |

### 2.5 Deploy

Click **Create Web Service**. Render will:
1. Pull your repository
2. Build the Docker image (`pip install -r requirements.txt`)
3. Run `python seed.py` (seeds demo data)
4. Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Watch the build log. A successful deploy shows:

```
==> Starting service with 'sh -c python seed.py && uvicorn ...'
✓ Settings seeded
✓ Users seeded  (admin/admin, staff01/staff123)
✓ Products seeded
✓ Suppliers seeded
✓ Receiving & Inventory seeded
INFO:     Application startup complete.
```

### 2.6 Note your backend URL

Your backend URL will look like: `https://kh-backend.onrender.com`

Test it:
```
https://kh-backend.onrender.com/health
→ {"status": "ok"}

https://kh-backend.onrender.com/api/docs
→ Swagger UI
```

---

## Step 3 — Deploy the Frontend on Vercel

### 3.1 Create a Vercel account

Go to **https://vercel.com** → Sign Up → connect with your GitHub account.

### 3.2 Import your repository

1. From the Vercel dashboard, click **Add New... → Project**
2. Find your `kopernik-harvest` repository → click **Import**

### 3.3 Configure the project

On the configuration screen:

| Setting | Value |
|---|---|
| **Framework Preset** | Vite *(auto-detected)* |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` *(auto-detected)* |
| **Output Directory** | `dist` *(auto-detected)* |
| **Install Command** | `npm install` *(auto-detected)* |

> **Important:** Set **Root Directory** to `frontend`. Click **Edit** next to it and type `frontend`.

### 3.4 Add environment variables

In the **Environment Variables** section:

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://kh-backend.onrender.com/api/v1` |

Replace `kh-backend` with your actual Render service name if it differs.

### 3.5 Deploy

Click **Deploy**. Vercel will:
1. Install dependencies (`npm install`)
2. Build the app (`npm run build`)
3. Publish `frontend/dist` to its CDN

A successful deploy shows a preview URL:

```
https://kopernik-harvest.vercel.app
```

---

## Step 4 — Update CORS on Render

Now that you have your Vercel URL, go back to Render and update the `CORS_ORIGINS` environment variable.

1. Render dashboard → your `kh-backend` service → **Environment**
2. Find `CORS_ORIGINS`
3. Update the value to include your Vercel domain:

```
https://kopernik-harvest.vercel.app,http://localhost:3000
```

4. Click **Save Changes** — Render will automatically redeploy

---

## Step 5 — Verify the Live Application

Open your Vercel URL in a browser and confirm:

```
□ Login page loads with Kopernik Harvest logo
□ Login with admin / admin succeeds
□ Dashboard shows KPI cards and charts
□ Products page lists 8 sample products
□ Suppliers page lists 5 sample suppliers
□ Receiving page lists 5 batches
□ Quotation — create a new quotation, check currency dropdown loads rates
□ Quotation — click PDF button, verify download
□ Invoice — create from quotation, verify grand total
□ Invoice — click eye icon, verify preview document
□ Invoice — click PDF button, verify download
□ Logout works
```

---

## Environment Variables Reference

### Backend (Render)

| Variable | Example Value | Required | Description |
|---|---|---|---|
| `SECRET_KEY` | *(generated)* | **Yes** | JWT signing key — never share |
| `ALGORITHM` | `HS256` | Yes | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Yes | Session duration (8 hours) |
| `DATABASE_URL` | `sqlite:///./kopernik_harvest.db` | Yes | Database connection string |
| `DEBUG` | `false` | Yes | Disable SQL logging in production |
| `CORS_ORIGINS` | `https://your-app.vercel.app,http://localhost:3000` | **Yes** | Must include your Vercel URL |

### Frontend (Vercel)

| Variable | Example Value | Required | Description |
|---|---|---|---|
| `VITE_API_URL` | `https://kh-backend.onrender.com/api/v1` | **Yes** | Full URL to the backend API |

---

## Database Strategy

### Why SQLite works for this demo

The backend Dockerfile runs `python seed.py` before starting Uvicorn on every container startup. The seed script is idempotent — it inserts sample data only if it does not already exist.

On Render's free tier the disk is ephemeral: all runtime data is wiped when the container restarts (every cold start after 15 minutes of inactivity, and every new deployment). This means:

- ✅ Demo always starts with clean, predictable data
- ✅ No need to manage or reset a database
- ✅ No database administration required
- ⚠️ Data created during a demo session is lost on the next restart

For a **demo environment**, this is the correct trade-off.

### Upgrading to persistent storage (when needed)

If you later need data to survive restarts, two options:

**Option A — Fly.io with a persistent volume (still free)**
```bash
fly launch
fly volumes create kh_db --size 1
```
Mount the volume and set `DATABASE_URL=sqlite:////data/kopernik_harvest.db`.

**Option B — Migrate to PostgreSQL**
1. Add `asyncpg` or `psycopg2-binary` to `requirements.txt`
2. Change `DATABASE_URL` to a PostgreSQL connection string
3. Update `database.py` to remove the SQLite-specific `connect_args`
4. Use Render's free PostgreSQL (available for 90 days) or Supabase free tier

---

## Custom Domain (Optional)

Both Render and Vercel support custom domains on the free tier.

**Vercel:** Project Settings → Domains → Add your domain → follow DNS instructions.

**Render:** Service Settings → Custom Domain → follow DNS instructions.

Example final URLs with a custom domain:
```
https://demo.kopernikharvest.com       ← Frontend (Vercel)
https://api.kopernikharvest.com        ← Backend (Render)
```

---

## Troubleshooting

### Backend build fails on Render

**Check:** Build logs in Render dashboard → Logs tab.

Common cause — Docker build error during `pip install`:
- Verify `requirements.txt` is inside `backend/` and committed to GitHub
- Verify `Dockerfile` path is `./backend/Dockerfile` in Render settings

### Frontend loads but API calls fail (network error)

**Check:** Browser console → Network tab. If requests go to `localhost:8000`, the env var was not applied.

**Fix:**
1. Vercel dashboard → your project → Settings → Environment Variables
2. Confirm `VITE_API_URL` is set and starts with `https://`
3. Redeploy: Deployments → Redeploy (latest)

### Login returns "Invalid username or password" on live site

**Cause:** The database seeded but the user was not created (seed script error).

**Fix:** Render dashboard → your service → Logs. Look for the seed output lines. If seed failed, check for a Python traceback and fix accordingly.

Alternatively, trigger a manual redeploy (which re-runs seed.py):
Render dashboard → Manual Deploy → Deploy latest commit.

### "CORS error" in browser console

**Symptom:** `Access-Control-Allow-Origin` error when frontend calls the backend.

**Fix:**
1. Render dashboard → your service → Environment
2. Find `CORS_ORIGINS`
3. Confirm your exact Vercel URL is included (no trailing slash)
4. Save → wait for redeploy

### First request is very slow (30–60 seconds)

**Cause:** Render free tier spins the container down after 15 minutes of inactivity.

**Fix:** Before a demo, open `https://kh-backend.onrender.com/health` in a browser tab 2–3 minutes before your meeting. The container will warm up, and subsequent requests will be instant.

### Render service shows "Deploy failed"

Check the logs for the specific error. Common causes:
1. `Dockerfile` CMD references a file path that does not exist inside the container
2. `seed.py` raised an exception on first run
3. Port mismatch — confirm `CMD` uses `${PORT:-8000}`

---

## Pre-Demo Checklist

Run through this list the day before presenting to stakeholders:

```
□ Backend is awake — open https://kh-backend.onrender.com/health
□ Frontend loads  — open https://kopernik-harvest.vercel.app
□ Login works     — admin / admin
□ Exchange rates load in quotation currency dropdown
□ PDF download works (quotation and invoice)
□ Logo appears in Login, Sidebar, and PDF documents
□ Create a test quotation and convert it to an invoice
□ Verify grand total and tax are displayed correctly
```

---

*Kopernik Harvest v1.1.0 — Render + Vercel free tier deployment*
