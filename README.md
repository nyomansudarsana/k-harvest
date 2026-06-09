---
title: Kopernik Harvest
emoji: 🌾
colorFrom: green
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Kopernik Harvest

**Agricultural Commodity Management System**

A full-stack web application for managing the complete lifecycle of agricultural commodities — from supplier receiving and quality control through inventory tracking, multi-currency quotation, and invoicing — with professional PDF document generation.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Default Login](#default-login)
- [Database Information](#database-information)
- [API Documentation](#api-documentation)
- [Build for Production](#build-for-production)
- [Docker Deployment](#docker-deployment)
- [Troubleshooting](#troubleshooting)
- [Development Notes](#development-notes)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Kopernik Harvest tracks the end-to-end flow of physical agricultural goods: inbound receiving from suppliers, quality inspection, inventory tracking by batch, price quotation with customer-facing PDF output, and invoice management with automated stock deduction on issue.

The system is fully self-contained — no cloud services required. It runs on a local network or server using SQLite, making it easy to deploy and maintain without database administration expertise.

---

## Features

### Operations
- **Receiving Management** — Record incoming commodity deliveries by supplier and batch; automatically updates stock inventory
- **Quality Control (QC)** — Pass/fail inspection per batch with remarks
- **Stock Inventory** — Real-time available quantity by batch; full stock movement audit log
- **Stock Opname** — Physical count adjustment with variance tracking

### Sales
- **Quotation Management** — Build price quotes with configurable cost components (manpower, management fee, margin)
- **Multi-Currency Quotations** — IDR, USD, EUR, AUD, SGD, JPY, GBP, MYR, THB with live Bank Indonesia exchange rates
- **Tax Calculation** — Configurable tax rate (default 10%) with Subtotal → Tax → Grand Total breakdown
- **Quotation Print Preview** — Professional customer-facing document preview in-browser
- **Quotation PDF Export** — Branded A4 PDF with full calculation breakdown, currency conversion, and signature line
- **Invoice Management** — Create invoices directly from approved quotations; inherits currency and tax settings
- **Invoice Preview & PDF** — Branded invoice document with payment information and status

### Master Data
- **Product Master** — Commodity catalog with origin, category, and unit of measure
- **Supplier Master** — Supplier directory with contact information

### Administration
- **User Management** — Role-based access control (Administrator / Staff)
- **System Settings** — Company name, address, invoice prefix, default currency
- **Dashboard** — KPI cards, monthly receiving trend chart, inventory by commodity, top suppliers, low-stock and expiry alerts

### Infrastructure
- **JWT Authentication** — 8-hour session tokens
- **Excel Export** — Data export to `.xlsx` from any table view
- **Responsive UI** — Bootstrap 5 layout with collapsible sidebar

---

## Technology Stack

### Frontend

| Package | Version | Purpose |
|---|---|---|
| React | 18.2.0 | UI framework |
| Vite | 5.1.4 | Build tool and dev server |
| React Router DOM | 6.22.0 | Client-side routing |
| Bootstrap | 5.3.2 | CSS framework |
| Bootstrap Icons | 1.11.3 | Icon set |
| Axios | 1.6.7 | HTTP client with JWT interceptor |
| React Select | 5.8.0 | Searchable dropdown menus |
| React Toastify | 10.0.4 | Toast notifications |
| Chart.js + react-chartjs-2 | 4.4.2 / 5.2.0 | Dashboard charts |
| xlsx + file-saver | 0.18.5 / 2.0.5 | Excel export |

### Backend

| Package | Version | Purpose |
|---|---|---|
| FastAPI | 0.115.0 | API framework |
| Uvicorn | 0.32.1 | ASGI server |
| SQLAlchemy | 2.0.36 | ORM and query builder |
| Pydantic | 2.10.4 | Request/response validation |
| python-jose | 3.3.0 | JWT encoding/decoding |
| passlib + bcrypt | 1.7.4 / 4.2.0 | Password hashing |
| ReportLab | 4.2.2 | Server-side A4 PDF generation |
| httpx | 0.27.2 | Async HTTP client (exchange rates) |
| openpyxl | 3.1.2 | Excel file support |

### Database

- **SQLite** — File-based, no server process required
- **WAL mode** — Enabled for improved concurrent read performance
- **No Alembic migrations** — New columns added via idempotent `ALTER TABLE ADD COLUMN` on startup

### Authentication

- **JWT HS256** — Tokens expire after 480 minutes (8 hours)
- **bcrypt** — All passwords hashed before storage

---

## Project Structure

```
Kopernik-Harvest/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py              # App settings (loads .env)
│   │   │   ├── deps.py                # FastAPI dependency injection
│   │   │   └── security.py            # JWT + bcrypt utilities
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   ├── supplier.py
│   │   │   ├── receiving.py
│   │   │   ├── qc.py
│   │   │   ├── inventory.py
│   │   │   ├── stock_movement.py
│   │   │   ├── stock_opname.py
│   │   │   ├── quotation.py
│   │   │   ├── invoice.py
│   │   │   └── settings.py
│   │   ├── routers/                   # FastAPI route handlers
│   │   │   ├── auth.py
│   │   │   ├── products.py
│   │   │   ├── suppliers.py
│   │   │   ├── receiving.py
│   │   │   ├── qc.py
│   │   │   ├── inventory.py
│   │   │   ├── stock_opname.py
│   │   │   ├── quotation.py
│   │   │   ├── invoice.py
│   │   │   ├── exchange_rates.py
│   │   │   ├── dashboard.py
│   │   │   ├── users.py
│   │   │   └── settings.py
│   │   ├── schemas/                   # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── exchange_rate_service.py   # BI SOAP API + fallback, 4h cache
│   │   │   ├── inventory_service.py       # Stock add/deduct logic
│   │   │   ├── pdf_service.py             # Invoice PDF (ReportLab)
│   │   │   └── quotation_pdf_service.py   # Quotation PDF (ReportLab)
│   │   ├── utils/
│   │   │   └── id_generator.py            # Sequential ID generator
│   │   ├── database.py                # Engine, session factory, migrations
│   │   └── main.py                    # App entry point, router registration
│   ├── .env                           # Environment variables (do not commit)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── seed.py                        # One-time sample data seeder
│   └── kopernik_harvest.db            # SQLite database (auto-created)
│
├── frontend/
│   ├── public/
│   │   ├── logo.svg                   # Square brand logo
│   │   ├── logo-h.svg                 # Horizontal brand logo (sidebar)
│   │   └── favicon.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/                # DataTable, Modal, SearchableSelect
│   │   │   ├── dashboard/             # Chart wrapper components
│   │   │   └── layout/                # Sidebar, Layout
│   │   ├── context/
│   │   │   └── AuthContext.jsx        # Login state and token management
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Products.jsx
│   │   │   ├── Suppliers.jsx
│   │   │   ├── Receiving.jsx
│   │   │   ├── QC.jsx
│   │   │   ├── Inventory.jsx
│   │   │   ├── StockOpname.jsx
│   │   │   ├── Quotation.jsx
│   │   │   ├── Invoice.jsx
│   │   │   ├── UserManagement.jsx
│   │   │   └── Settings.jsx
│   │   ├── services/
│   │   │   └── api.js                 # Axios instance with JWT interceptor
│   │   └── utils/
│   │       └── helpers.js             # formatNumber, formatDate, exportToExcel
│   ├── Dockerfile
│   ├── nginx.conf                     # Production nginx reverse proxy
│   ├── package.json
│   └── vite.config.js                 # Dev server on :3000, proxies /api → :8000
│
├── docker-compose.yml
└── README.md
```

---

## Prerequisites

| Software | Version | Notes |
|---|---|---|
| Python | **3.11+** | Tested on 3.11 (used in Dockerfile) |
| Node.js | **20+** | Tested on 20-alpine (used in Dockerfile) |
| npm | 9+ | Bundled with Node.js 20 |
| Git | Any | For cloning the repository |
| Docker + Docker Compose | 24+ / 2.20+ | Only required for containerized deployment |

**Windows users:** Install Python from [python.org](https://python.org) and Node.js from [nodejs.org](https://nodejs.org). Ensure both are added to your `PATH` during installation.

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/kopernik-harvest.git
cd kopernik-harvest
```

---

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create and activate a Python virtual environment:

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux / macOS:**
```bash
python -m venv venv
source venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

---

### 3. Database Setup

The SQLite database file is created automatically on first run. To pre-populate it with sample master data and seed user accounts, run the seeder once:

```bash
python seed.py
```

Expected output:
```
Seeding database...
✓ Settings seeded
✓ Users seeded  (admin/admin, staff01/staff123)
✓ Products seeded
✓ Suppliers seeded
✓ Receiving & Inventory seeded

✓ All seed data inserted successfully!
  Login: admin / admin
```

Sample data created by the seeder:
- **8 products** — Coffee Arabica, Coffee Robusta, Cocoa Beans, Palm Oil, Vanilla Beans, Black Pepper, Cashew Nuts, Sesame Seeds
- **5 suppliers** — from Ethiopia, Vietnam, Ghana, Indonesia, Madagascar
- **5 receiving batches** — with matching inventory records
- **2 user accounts** — `admin` (Administrator) and `staff01` (Staff)

> The seed script is **idempotent**. Running it again will not create duplicates.

---

### 4. Frontend Setup

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
```

---

## Environment Variables

The backend reads from `backend/.env`. A default file is included in the repository.

**For production, you must change `SECRET_KEY` before deployment.**

```env
# backend/.env

APP_NAME=Kopernik Harvest

# JWT signing key — replace with a strong random string in production
SECRET_KEY=kopernik-harvest-super-secret-key-change-in-production-2024
ALGORITHM=HS256

# Login session duration in minutes (480 = 8 hours)
ACCESS_TOKEN_EXPIRE_MINUTES=480

# SQLite database path — relative to the backend/ directory
DATABASE_URL=sqlite:///./kopernik_harvest.db

# Set to False in production (disables SQLAlchemy query logging)
DEBUG=True
```

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | *(weak default)* | JWT signing key. **Must be changed before production deployment.** |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Session duration (8 hours) |
| `DATABASE_URL` | `sqlite:///./kopernik_harvest.db` | SQLAlchemy database connection string |
| `DEBUG` | `True` | Enables SQL query logging when `True` |

**Generate a secure key:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Running the Application

### Start the Backend

From inside the `backend/` directory, with the virtual environment activated:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

> The `--reload` flag restarts the server automatically when Python source files change. Remove it in production.

---

### Start the Frontend

From inside the `frontend/` directory:

```bash
npm run dev
```

Expected output:
```
  VITE v5.1.4  ready in ~300 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

---

### Access the Application

| Service | URL |
|---|---|
| **Web Application** | http://localhost:3000 |
| **Backend API** | http://localhost:8000 |
| **Swagger UI (interactive API docs)** | http://localhost:8000/api/docs |
| **ReDoc (readable API docs)** | http://localhost:8000/api/redoc |
| **Health check** | http://localhost:8000/health |

> The Vite dev server proxies all `/api/*` requests to `http://localhost:8000` (configured in `vite.config.js`), so the frontend and backend communicate without CORS issues during development.

---

## Default Login

Two accounts are created by `seed.py`:

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `admin` | Administrator | Full access including User Management |
| `staff01` | `staff123` | Staff | All modules except User Management |

> **Change these passwords after first login** via the User Management module.

---

## Database Information

| Setting | Value |
|---|---|
| Engine | SQLite 3 |
| File location | `backend/kopernik_harvest.db` |
| WAL mode | Enabled (better concurrent reads) |
| Foreign keys | Enforced at connection level |
| Schema management | `Base.metadata.create_all()` + `run_migrations()` on startup |

### Tables

| Table | Description |
|---|---|
| `users` | User accounts (Administrator / Staff roles) |
| `product_master` | Commodity catalog — ID, name, origin, category, unit |
| `supplier_master` | Supplier directory with contact info |
| `receiving` | Inbound delivery records; each creates a unique `batch_id` |
| `qc` | Quality control inspections linked to receiving batches |
| `inventory` | Current available quantity per commodity/batch |
| `stock_movement` | Full audit log of every inventory in/out event |
| `stock_opname` | Physical count records with system vs. actual variance |
| `quotation` | Price quotations with currency, tax, and cost breakdown |
| `invoice` | Customer invoices linked to quotations |
| `system_settings` | Key-value store for company info and configuration |

### Soft Deletes

Every table has a `deleted_at` column. Records are never physically removed — they are filtered out with `WHERE deleted_at IS NULL`. This preserves the full audit trail.

### Quotation Price Formula

```
Quote Price (per unit) =
    Purchase Price
  + Delivery Cost Per Unit
  + (Purchase Price × Manpower %)
  + (Purchase Price × Management Fee %)
  + (Purchase Price × Margin %)

Subtotal   = Quote Price × Quantity
Tax Amount = Subtotal × Tax Rate %
Grand Total = Subtotal + Tax Amount
```

---

## API Documentation

All endpoints require a `Bearer` JWT token in the `Authorization` header, except `POST /api/v1/auth/login`.

**Base URL:** `http://localhost:8000/api/v1`

Full interactive documentation is available at http://localhost:8000/api/docs after starting the backend.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | Obtain JWT access token (`username` + `password`) |
| `GET` | `/auth/me` | Return the currently authenticated user profile |

### Products

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/products` | Paginated list with optional search |
| `GET` | `/products/all` | All active products (used by dropdowns) |
| `POST` | `/products` | Create product |
| `PUT` | `/products/{commodity_id}` | Update product |
| `DELETE` | `/products/{commodity_id}` | Soft-delete product |

### Suppliers

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/suppliers` | Paginated list with optional search |
| `GET` | `/suppliers/all` | All suppliers (used by dropdowns) |
| `POST` | `/suppliers` | Create supplier |
| `PUT` | `/suppliers/{supplier_id}` | Update supplier |
| `DELETE` | `/suppliers/{supplier_id}` | Soft-delete supplier |

### Receiving

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/receiving` | Paginated list with optional search |
| `GET` | `/receiving/batches` | All batches with current available quantity |
| `POST` | `/receiving` | Record delivery — auto-creates batch and updates inventory |
| `DELETE` | `/receiving/{receiving_id}` | Soft-delete record |

### Quality Control

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/qc` | List QC records |
| `POST` | `/qc` | Submit QC inspection for a batch |

### Inventory

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/inventory` | Current stock levels per batch |
| `GET` | `/inventory/movements` | Full stock movement audit log |

### Stock Opname

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stock-opname` | List physical count records |
| `POST` | `/stock-opname` | Submit physical count — auto-adjusts inventory |

### Quotations

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/quotations` | Paginated list — filterable by status |
| `GET` | `/quotations/all` | All pending quotations (used by invoice dropdown) |
| `POST` | `/quotations/calculate` | Calculate price breakdown without saving |
| `POST` | `/quotations` | Create and save a quotation |
| `GET` | `/quotations/{id}` | Get quotation detail |
| `PUT` | `/quotations/{id}` | Update quotation (percentages, customer info, currency) |
| `DELETE` | `/quotations/{id}` | Soft-delete quotation |
| `GET` | `/quotations/{id}/pdf` | Download quotation as branded A4 PDF |

### Invoices

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/invoices` | Paginated list — filterable by status |
| `POST` | `/invoices/from-quotation` | Create invoice from an approved quotation |
| `GET` | `/invoices/{id}` | Get invoice detail |
| `PUT` | `/invoices/{id}` | Update invoice (status, quantity, etc.) |
| `DELETE` | `/invoices/{id}` | Soft-delete invoice |
| `GET` | `/invoices/{id}/pdf` | Download invoice as branded A4 PDF |

**Invoice status flow:**

```
Draft → Issued → Paid
      ↘            ↘
       Cancelled    Cancelled
```

> Changing status from **Draft** to **Issued** automatically deducts the invoiced quantity from the linked batch's inventory.

### Exchange Rates

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/exchange-rates` | Current IDR mid-rates for all supported currencies |

Supported: IDR, USD, EUR, AUD, SGD, JPY, GBP, MYR, THB

Primary source: Bank Indonesia SOAP API. Fallback: open.er-api.com. Results are cached in memory for 4 hours.

### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard/kpis` | Key counters (products, suppliers, stock, invoices) |
| `GET` | `/dashboard/monthly-receiving` | Receiving count for last 12 months |
| `GET` | `/dashboard/inventory-by-commodity` | Stock grouped by commodity |
| `GET` | `/dashboard/top-suppliers` | Top 5 suppliers by delivery count |
| `GET` | `/dashboard/alerts` | Low-stock items and batches expiring within 30 days |

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users` | List users (Administrator role required) |
| `POST` | `/users` | Create user (Administrator role required) |
| `PUT` | `/users/{user_id}` | Update user |
| `DELETE` | `/users/{user_id}` | Deactivate user |

### Settings

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/settings` | Get all system settings |
| `PUT` | `/settings/{key}` | Update a setting by key |

---

## Build for Production

### Frontend

```bash
cd frontend
npm run build
```

The compiled output is written to `frontend/dist/`. Preview the build locally before deploying:

```bash
npm run preview
```

### Backend

Set `DEBUG=False` in `backend/.env`, then start without `--reload`:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> SQLite does not support concurrent writes from multiple processes. Keep `--workers 1`. If you need higher concurrency, migrate to PostgreSQL and update the `DATABASE_URL`.

---

## Docker Deployment

The included `docker-compose.yml` builds and starts both services together.

### Start

```bash
docker compose up --build -d
```

| Container | Port | Service |
|---|---|---|
| `kh-backend` | `8000` | FastAPI backend |
| `kh-frontend` | `80` | React app served by nginx |

Access the application at: **http://localhost**

The database is stored in a named Docker volume (`kh-db`) and persists across container restarts and rebuilds.

### Stop

```bash
docker compose down
```

### View Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### Environment Variables (Docker)

Override environment variables in `docker-compose.yml` before deploying:

```yaml
environment:
  - SECRET_KEY=your-strong-random-secret-min-32-chars
  - DATABASE_URL=sqlite:///./data/kopernik_harvest.db
  - ACCESS_TOKEN_EXPIRE_MINUTES=480
  - DEBUG=False
```

---

## Troubleshooting

### Login fails immediately after startup

**Cause:** The database has not been seeded, or the `.db` file was not found.

**Fix:**
```bash
cd backend
python seed.py
```
Restart the backend and try again.

---

### Dropdowns in modals are empty

**Cause:** The API call to load dropdown options failed silently, or returned a non-array response.

**Fix:** Open the browser developer console (F12 → Console) and look for a red error. Common causes:
- `401 Unauthorized` — your session has expired; log out and log back in
- `5xx` error — check the backend terminal for a Python traceback
- Network error — confirm the backend is running on port 8000

---

### API connection failed / CORS error in browser console

**Cause:** Accessing the React app directly via the file system instead of through the Vite dev server, or the backend is not running.

**Fix:** Make sure both services are running. Always open the app through the Vite dev server (`http://localhost:3000`), not by double-clicking `index.html`. The Vite proxy handles `/api/*` → `:8000` automatically.

---

### `Cannot find module` or `ModuleNotFoundError` on backend start

**Cause:** Virtual environment not activated, or dependencies not installed.

**Fix:**
```bash
# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
```

---

### Port already in use

**Backend (port 8000):**

Windows:
```bash
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

Linux / macOS:
```bash
lsof -i :8000
kill -9 <pid>
```

**Frontend (port 3000):**

Windows:
```bash
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

---

### Database file not found at runtime

**Cause:** Uvicorn was started from a directory other than `backend/`, so the relative path in `DATABASE_URL` resolves to the wrong location.

**Fix:** Always start the backend from inside the `backend/` directory:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

---

### Exchange rates not loading

**Cause:** No internet access — the Bank Indonesia SOAP API and the fallback API are both unreachable.

**Behaviour:** The currency dropdown still works. IDR is always available without a network call. Other currencies will show the last cached rate, or zero if the server just started and no cache exists yet.

---

### PDF download fails or produces a blank file

**Cause:** ReportLab is missing or an incompatible version is installed.

**Fix:**
```bash
pip install "reportlab==4.2.2"
```

---

### `npm install` fails on Windows (long path error)

**Fix:** Enable long path support in Git and Windows:
```bash
git config --global core.longpaths true
```
Then re-run `npm install`.

---

## Development Notes

### Adding a New Module

1. **Model** — Create `backend/app/models/your_module.py`. Import the class in `backend/app/models/__init__.py`.
2. **Schema** — Create `backend/app/schemas/your_module.py` with `Base`, `Create`, `Update`, and `Response` Pydantic classes.
3. **Router** — Create `backend/app/routers/your_module.py` with a `router = APIRouter(prefix="/your-module")`. Register it in `backend/app/main.py`.
4. **Frontend page** — Create `frontend/src/pages/YourModule.jsx`. Add the `<Route>` in `frontend/src/App.jsx` and a nav entry in `frontend/src/components/layout/Sidebar.jsx`.

### Adding a Column to an Existing Table

`create_all()` does not alter existing tables. Add an `ALTER TABLE` statement to the `run_migrations()` function in `backend/app/database.py`:

```python
def run_migrations(eng=None):
    ...
    migrations = [
        # existing migrations ...
        "ALTER TABLE your_table ADD COLUMN new_column VARCHAR(50) DEFAULT ''",
    ]
```

The `try/except` around each statement makes this safe to run on databases that already have the column — duplicates are silently ignored.

### ID Generation

All business record IDs (e.g., `QT00001`, `INV-00001`) are produced by `backend/app/utils/id_generator.py`:

```python
from app.utils.id_generator import generate_id

quotation_id = generate_id(db, Quotation, "quotation_id", "QT", 5)
# Returns "QT00001", "QT00002", etc.
```

### JWT Token

The token is stored in `localStorage` as `kh_token`. The Axios interceptor in `frontend/src/services/api.js` attaches it automatically to every outbound request. A `401` response from the API clears the token and redirects to `/login`.

### User Roles

| Role | Access |
|---|---|
| `Administrator` | Full access, including User Management |
| `Staff` | All modules except User Management |

Role enforcement is handled server-side in `backend/app/core/deps.py`.

---

## Changelog

### v1.1.0

- Multi-currency support on quotations (IDR, USD, EUR, AUD, SGD, JPY, GBP, MYR, THB)
- Live exchange rates from Bank Indonesia SOAP API with open.er-api.com fallback and 4-hour in-memory cache
- Tax calculation on quotations — Subtotal → Tax → Grand Total
- Quotation print preview modal with professional customer-facing document layout
- Quotation PDF export via ReportLab — full breakdown, currency conversion, and signature line
- Invoice preview modal with branded document layout and status indicator
- Invoice PDF updated with Kopernik Harvest green branding, tax display, and currency support
- Kopernik Harvest SVG logos deployed across Login page, Sidebar, and PDF documents
- Receiving module labels updated: "Purchase Price (IDR)" and "Delivery Cost Per Unit (IDR)"
- Quotation and Invoice table columns updated to display currency badge and grand total
- Backward-compatible database column additions via idempotent `ALTER TABLE ADD COLUMN`

### v1.0.0

- Initial release
- Product Master and Supplier Master with CRUD
- Receiving management with automatic batch creation and inventory update
- Quality Control (QC) module
- Stock Inventory with movement audit log
- Stock Opname with physical count adjustment
- Quotation module with configurable cost component percentages
- Invoice module — create from quotation, auto stock deduction on issue
- Dashboard with KPI cards, charts, low-stock and expiry alerts
- User Management with Administrator and Staff roles
- System Settings (company name, address, invoice prefix, currency)
- JWT authentication with 8-hour sessions
- Excel export on all data tables

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes with a descriptive message
4. Push: `git push origin feature/your-feature-name`
5. Open a Pull Request

**Code style:**
- **Backend:** PEP 8, type hints on all function signatures, Pydantic schemas for every request/response body
- **Frontend:** Functional components only, React hooks for state management
- Do not break existing API contracts without incrementing the version

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2024 Kopernik Harvest

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

*Kopernik Harvest v1.1.0 — Built with FastAPI + React*
