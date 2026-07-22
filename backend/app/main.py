import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from app.database import engine, Base, run_migrations, seed_quotation_details, seed_command_center_defaults, seed_rbac_defaults, seed_workflow_defaults
from app.core.config import settings

from app.models import (
    User, ProductMaster, SupplierMaster, Receiving, ReceivingExtraCost,
    QC, QCFailedInventory, Inventory, StockMovement, StockOpname,
    Quotation, QuotationDetail, Invoice, InvoiceDetail, SystemSettings,
    CCCategory, CCPriority, CCStatus, CCLabel,
    CCTask, CCTaskAssignee, CCTaskLabel, CCChecklist, CCAttachment,
    CCTaskLocation, CCReminder, CCComment, CCActivity, CCNotification,
    Role, MenuPermission, WorkflowRule, ClientMaster,
)

from app.routers import (
    auth, users, products, suppliers, receiving, qc,
    inventory, stock_opname, quotation, invoice,
    settings as settings_router, dashboard,
)
from app.routers import exchange_rates
from app.routers import command_center
from app.routers import rbac as rbac_router
from app.routers import workflow as workflow_router
from app.routers import clients as clients_router

os.makedirs("uploads/cc_attachments", exist_ok=True)
run_migrations(engine)
Base.metadata.create_all(bind=engine)
seed_quotation_details(engine)
seed_command_center_defaults(engine)
seed_rbac_defaults(engine)
seed_workflow_defaults(engine)

app = FastAPI(
    title="Kopernik Harvest API",
    description="Inventory, Product Tracking & Quotation Management System",
    version="1.2.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
app.include_router(command_center.router, prefix=PREFIX)
app.include_router(rbac_router.router, prefix=PREFIX)
app.include_router(workflow_router.router, prefix=PREFIX)
app.include_router(clients_router.router, prefix=PREFIX)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
def root():
    return {"message": "Kopernik Harvest API", "version": "1.2.0", "docs": "/api/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
