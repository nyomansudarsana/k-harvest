---
name: project-kopernik-harvest
description: Full-stack Kopernik Harvest system — FastAPI + React, built at d:\K-HARVEST. All modules complete.
metadata:
  type: project
---

Full-stack web application built at `d:\K-HARVEST`.

- **Backend**: Python FastAPI, SQLAlchemy, SQLite, JWT auth, bcrypt
- **Frontend**: React 18, Bootstrap 5, Chart.js, Vite
- **DB**: SQLite with soft delete on all 11 tables

**Key IDs**: Products = KH00001, Suppliers = SU00001, Invoices = INV-00001 (prefix configurable)

**Business logic implemented**:
- Receiving → auto inventory increase via `inventory_service.add_stock()`
- Invoice issue → auto inventory deduction via `inventory_service.deduct_stock()`
- Stock Opname → auto adjustment via `inventory_service.adjust_stock()`
- Quotation price = Purchase + Delivery + (Purchase × manpower% + mgmt% + margin%)
- All stock changes create `stock_movement` records

**Default seed**: admin/admin, 8 products, 5 suppliers, 5 receiving records

**How to apply**: Reference this when resuming work on the system. All modules are at `backend/app/` and `frontend/src/`.

**Why**: Built from scratch per client specification for Kopernik organization.
