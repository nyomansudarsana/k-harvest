"""
Seed script — run once to populate the database with sample data.
Usage: python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import date, timedelta
from app.database import SessionLocal, engine, Base
from app.models import (
    User, ProductMaster, SupplierMaster, Receiving, Inventory,
    StockMovement, SystemSettings,
)
from app.core.security import get_password_hash
from app.services.inventory_service import add_stock

Base.metadata.create_all(bind=engine)


def seed_settings(db):
    settings = [
        ("company_name", "Kopernik Harvest", "Company display name"),
        ("company_address", "Jl. Raya No. 1, Jakarta, Indonesia", "Company address"),
        ("company_logo", "", "Company logo URL"),
        ("invoice_prefix", "INV", "Invoice ID prefix"),
        ("currency", "USD", "Default currency"),
    ]
    for key, value, desc in settings:
        if not db.query(SystemSettings).filter_by(key=key).first():
            db.add(SystemSettings(key=key, value=value, description=desc))
    db.commit()
    print("✓ Settings seeded")


def seed_users(db):
    if not db.query(User).filter_by(username="admin").first():
        db.add(User(
            user_id="USR00001",
            full_name="Administrator",
            username="admin",
            password_hash=get_password_hash("admin"),
            email="admin@kopernikharvest.com",
            role="Administrator",
            status="Active",
        ))
    if not db.query(User).filter_by(username="staff01").first():
        db.add(User(
            user_id="USR00002",
            full_name="Staff User",
            username="staff01",
            password_hash=get_password_hash("staff123"),
            email="staff@kopernikharvest.com",
            role="Staff",
            status="Active",
        ))
    db.commit()
    print("✓ Users seeded  (admin/admin, staff01/staff123)")


def seed_products(db):
    products = [
        ("KH00001", "Coffee Arabica", "Ethiopia", "Coffee", "Coffee Arabica Grade A", "Kg"),
        ("KH00002", "Coffee Robusta", "Vietnam", "Coffee", "Coffee Robusta Grade B", "Kg"),
        ("KH00003", "Cocoa Beans", "Ghana", "Cocoa", "Fermented Cocoa Beans", "Kg"),
        ("KH00004", "Palm Oil", "Indonesia", "Oil", "Refined Palm Oil", "Liter"),
        ("KH00005", "Vanilla Beans", "Madagascar", "Spice", "Grade A Vanilla Beans", "Kg"),
        ("KH00006", "Pepper Black", "India", "Spice", "Black Pepper Whole", "Kg"),
        ("KH00007", "Cashew Nuts", "Ivory Coast", "Nuts", "Cashew Nuts W320", "Kg"),
        ("KH00008", "Sesame Seeds", "Ethiopia", "Seeds", "White Sesame Seeds", "Kg"),
    ]
    for cid, commodity, origin, category, name, unit in products:
        if not db.query(ProductMaster).filter_by(commodity_id=cid).first():
            db.add(ProductMaster(
                commodity_id=cid,
                commodity=commodity,
                origin=origin,
                categories=category,
                product_name=name,
                unit=unit,
                status="Active",
            ))
    db.commit()
    print("✓ Products seeded")


def seed_suppliers(db):
    suppliers = [
        ("SU00001", "Ethiopian Coffee Traders", "+251 911 123456", "contact@ect.et", "Addis Ababa, Ethiopia"),
        ("SU00002", "Vietnam Coffee Export Corp", "+84 28 3822 1234", "export@vcec.vn", "Ho Chi Minh City, Vietnam"),
        ("SU00003", "Ghana Cocoa Board", "+233 302 221212", "info@gcb.gh", "Accra, Ghana"),
        ("SU00004", "PT. Palma Nusantara", "+62 21 5252 1234", "sales@palma.co.id", "Jakarta, Indonesia"),
        ("SU00005", "Madagascar Vanilla Co.", "+261 20 222 1234", "info@madagascarvanilla.com", "Antananarivo, Madagascar"),
    ]
    for sid, name, phone, email, loc in suppliers:
        if not db.query(SupplierMaster).filter_by(supplier_id=sid).first():
            db.add(SupplierMaster(
                supplier_id=sid,
                supplier_name=name,
                contact_number=phone,
                contact_email=email,
                location=loc,
            ))
    db.commit()
    print("✓ Suppliers seeded")


def seed_receiving(db):
    today = date.today()
    receivings = [
        ("RC00001", today - timedelta(days=30), "KH00001", "Coffee Arabica Grade A", "SU00001", "Ethiopian Coffee Traders", 5000, "KH00001-20240101-001", today - timedelta(days=60), today + timedelta(days=180), 3.50, 0.20),
        ("RC00002", today - timedelta(days=25), "KH00002", "Coffee Robusta Grade B", "SU00002", "Vietnam Coffee Export Corp", 8000, "KH00002-20240106-001", today - timedelta(days=45), today + timedelta(days=365), 2.80, 0.15),
        ("RC00003", today - timedelta(days=20), "KH00003", "Fermented Cocoa Beans", "SU00003", "Ghana Cocoa Board", 3000, "KH00003-20240111-001", today - timedelta(days=30), today + timedelta(days=365), 4.20, 0.30),
        ("RC00004", today - timedelta(days=15), "KH00004", "Refined Palm Oil", "SU00004", "PT. Palma Nusantara", 10000, "KH00004-20240116-001", today - timedelta(days=20), today + timedelta(days=365), 1.20, 0.10),
        ("RC00005", today - timedelta(days=10), "KH00005", "Grade A Vanilla Beans", "SU00005", "Madagascar Vanilla Co.", 500, "KH00005-20240121-001", today - timedelta(days=15), today + timedelta(days=730), 150.0, 5.0),
    ]
    for rid, dr, cid, pname, sid, sname, qty, bid, hd, ed, pp, dc in receivings:
        if not db.query(Receiving).filter_by(receiving_id=rid).first():
            r = Receiving(
                receiving_id=rid,
                date_received=dr,
                commodity_id=cid,
                product_name=pname,
                supplier_id=sid,
                supplier_name=sname,
                quantity=qty,
                batch_id=bid,
                harvest_date=hd,
                expired_date=ed,
                purchase_price=pp,
                delivery_cost=dc,
            )
            db.add(r)
            db.flush()
            add_stock(db, cid, pname, bid, qty, "Receiving", rid, f"Seeded from {sname}")
    db.commit()
    print("✓ Receiving & Inventory seeded")


if __name__ == "__main__":
    db = SessionLocal()
    print("Seeding database...")
    seed_settings(db)
    seed_users(db)
    seed_products(db)
    seed_suppliers(db)
    seed_receiving(db)
    print("\n✓ All seed data inserted successfully!")
    print("  Login: admin / admin")
    db.close()
