import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=settings.DEBUG,
)

# Enable WAL mode for better SQLite concurrency
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations(eng=None):
    """Safely add new columns to existing tables. Idempotent — runs on every startup."""
    target = eng or engine
    migrations = [
        # Quotation: multi-currency + tax fields
        "ALTER TABLE quotation ADD COLUMN currency_code VARCHAR(10) DEFAULT 'IDR'",
        "ALTER TABLE quotation ADD COLUMN exchange_rate FLOAT DEFAULT 1.0",
        "ALTER TABLE quotation ADD COLUMN exchange_rate_timestamp DATETIME",
        "ALTER TABLE quotation ADD COLUMN tax_percentage FLOAT DEFAULT 10.0",
        "ALTER TABLE quotation ADD COLUMN tax_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE quotation ADD COLUMN grand_total FLOAT DEFAULT 0.0",
        # Invoice: currency fields (for quotation-linked invoices)
        "ALTER TABLE invoice ADD COLUMN currency_code VARCHAR(10) DEFAULT 'IDR'",
        "ALTER TABLE invoice ADD COLUMN exchange_rate FLOAT DEFAULT 1.0",
        "ALTER TABLE invoice ADD COLUMN tax_percentage FLOAT DEFAULT 0.0",
        "ALTER TABLE invoice ADD COLUMN tax_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE invoice ADD COLUMN grand_total FLOAT DEFAULT 0.0",
    ]
    with target.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore
