"""
Seed script — runs on container startup to initialize system defaults.
Only seeds essential system data: settings and the admin user.
All business data (products, suppliers, inventory) is entered by users.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app.models import User, SystemSettings
from app.core.security import get_password_hash

Base.metadata.create_all(bind=engine)


def seed_settings(db):
    settings = [
        ("company_name",    "Kopernik Harvest",  "Company display name"),
        ("company_address", "",                  "Company address"),
        ("company_logo",    "",                  "Company logo URL"),
        ("invoice_prefix",  "INV",               "Invoice ID prefix"),
        ("currency",        "IDR",               "Default currency"),
    ]
    for key, value, desc in settings:
        if not db.query(SystemSettings).filter_by(key=key).first():
            db.add(SystemSettings(key=key, value=value, description=desc))
    db.commit()


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
    db.commit()


if __name__ == "__main__":
    db = SessionLocal()
    seed_settings(db)
    seed_users(db)
    db.close()
