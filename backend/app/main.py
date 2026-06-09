import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from app.database import engine, Base, run_migrations
from app.core.config import settings

# Import all models so they're registered before create_all
from app.models import (
    User, ProductMaster, SupplierMaster, Receiving, QC,
    Inventory, StockMovement, StockOpname, Quotation, Invoice, SystemSettings,
)

from app.routers import (
    auth, users, products, suppliers, receiving, qc,
    inventory, stock_opname, quotation, invoice, settings as settings_router, dashboard,
)
from app.routers import exchange_rates

# Run ALTER TABLE migrations for new columns (idempotent)
run_migrations(engine)

# Create any new tables introduced by model changes
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Kopernik Harvest API",
    description="Inventory, Product Tracking & Quotation Management System",
    version="1.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(products.router, prefix=PREFIX)
app.include_router(suppliers.router, prefix=PREFIX)
app.include_router(receiving.router, prefix=PREFIX)
app.include_router(qc.router, prefix=PREFIX)
app.include_router(inventory.router, prefix=PREFIX)
app.include_router(stock_opname.router, prefix=PREFIX)
app.include_router(quotation.router, prefix=PREFIX)
app.include_router(invoice.router, prefix=PREFIX)
app.include_router(settings_router.router, prefix=PREFIX)
app.include_router(dashboard.router, prefix=PREFIX)
app.include_router(exchange_rates.router, prefix=PREFIX)


@app.get("/")
def root():
    return {"message": "Kopernik Harvest API", "version": "1.1.0", "docs": "/api/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
