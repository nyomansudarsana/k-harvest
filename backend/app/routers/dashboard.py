from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.product import ProductMaster
from app.models.supplier import SupplierMaster
from app.models.receiving import Receiving
from app.models.inventory import Inventory
from app.models.quotation import Quotation
from app.models.invoice import Invoice
from app.models.stock_movement import StockMovement

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/kpis", response_model=dict)
def get_kpis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_products = db.query(ProductMaster).filter(ProductMaster.deleted_at.is_(None), ProductMaster.status == "Active").count()
    total_suppliers = db.query(SupplierMaster).filter(SupplierMaster.deleted_at.is_(None)).count()
    total_stock = db.query(func.sum(Inventory.available_qty)).filter(Inventory.deleted_at.is_(None)).scalar() or 0
    receiving_this_month = db.query(Receiving).filter(
        Receiving.deleted_at.is_(None),
        Receiving.created_at >= month_start,
    ).count()
    pending_quotations = db.query(Quotation).filter(Quotation.deleted_at.is_(None), Quotation.status == "Pending").count()
    total_invoices = db.query(Invoice).filter(Invoice.deleted_at.is_(None)).count()

    return {
        "total_products": total_products,
        "total_suppliers": total_suppliers,
        "total_stock_qty": float(total_stock),
        "receiving_this_month": receiving_this_month,
        "pending_quotations": pending_quotations,
        "total_invoices": total_invoices,
    }


@router.get("/monthly-receiving", response_model=list)
def monthly_receiving(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    results = []
    for i in range(11, -1, -1):
        # Step back by whole calendar months to avoid duplicate/skipped months
        month = now.month - i
        year = now.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        count = db.query(Receiving).filter(
            Receiving.deleted_at.is_(None),
            extract("year", Receiving.created_at) == year,
            extract("month", Receiving.created_at) == month,
        ).count()
        from datetime import date
        label = date(year, month, 1).strftime("%b %Y")
        results.append({"month": label, "count": count})
    return results


@router.get("/inventory-by-commodity", response_model=list)
def inventory_by_commodity(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(
        Inventory.commodity_id,
        Inventory.product_name,
        func.sum(Inventory.available_qty).label("total_qty"),
    ).filter(Inventory.deleted_at.is_(None)).group_by(Inventory.commodity_id, Inventory.product_name).all()
    return [{"commodity_id": r.commodity_id, "product_name": r.product_name, "total_qty": float(r.total_qty or 0)} for r in rows]


@router.get("/top-suppliers", response_model=list)
def top_suppliers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(
        Receiving.supplier_id,
        Receiving.supplier_name,
        func.count(Receiving.id).label("receiving_count"),
        func.sum(Receiving.quantity).label("total_qty"),
    ).filter(Receiving.deleted_at.is_(None)).group_by(Receiving.supplier_id, Receiving.supplier_name).order_by(
        func.count(Receiving.id).desc()
    ).limit(5).all()
    return [
        {"supplier_id": r.supplier_id, "supplier_name": r.supplier_name,
         "receiving_count": r.receiving_count, "total_qty": float(r.total_qty or 0)}
        for r in rows
    ]


@router.get("/alerts", response_model=dict)
def get_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from datetime import date as date_type
    today = datetime.utcnow().date()

    # Low stock: available_qty < 100
    low_stock = db.query(Inventory).filter(
        Inventory.deleted_at.is_(None),
        Inventory.available_qty < 100,
        Inventory.available_qty > 0,
    ).all()

    # Expiring within 30 days — with severity levels (Enh 4)
    future_30 = today + timedelta(days=30)
    expiring = db.query(Receiving).filter(
        Receiving.deleted_at.is_(None),
        Receiving.expired_date.isnot(None),
        Receiving.expired_date <= future_30,
    ).order_by(Receiving.expired_date).all()

    def expiry_level(exp_date):
        if exp_date is None:
            return None
        delta = (exp_date - today).days
        if delta < 0:
            return "danger"
        if delta <= 7:
            return "critical"
        if delta <= 14:
            return "high"
        return "warning"

    expiring_batches = []
    for r in expiring:
        level = expiry_level(r.expired_date)
        if level:
            expiring_batches.append({
                "batch_id": r.batch_id,
                "product_name": r.product_name,
                "expired_date": str(r.expired_date),
                "days_until_expiry": (r.expired_date - today).days,
                "level": level,
            })

    return {
        "low_stock": [
            {"batch_id": i.batch_id, "product_name": i.product_name, "available_qty": i.available_qty}
            for i in low_stock
        ],
        "expiring_batches": expiring_batches,
    }
