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


def _make_quotation_legacy_fields_nullable(conn):
    """
    SQLite does not support ALTER COLUMN, so we use table reconstruction
    to drop the NOT NULL constraints on legacy single-product fields.
    Only runs if commodity_id column still has a NOT NULL constraint.
    Idempotent: if column is already nullable the PRAGMA check returns nothing.
    """
    try:
        # Check whether commodity_id is still NOT NULL (notnull = 1)
        rows = conn.execute(text("PRAGMA table_info(quotation)")).fetchall()
        # rows: (cid, name, type, notnull, dflt_value, pk)
        needs_fix = any(r[1] == "commodity_id" and r[3] == 1 for r in rows)
        if not needs_fix:
            return

        logger.info("Rebuilding quotation table to drop NOT NULL on legacy fields…")
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS quotation_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quotation_id VARCHAR(20) NOT NULL UNIQUE,
                customer_name VARCHAR(200),
                customer_email VARCHAR(100),
                notes VARCHAR(500),
                status VARCHAR(30) NOT NULL DEFAULT 'Draft',
                currency_code VARCHAR(10) DEFAULT 'IDR',
                exchange_rate FLOAT DEFAULT 1.0,
                exchange_rate_timestamp DATETIME,
                tax_percentage FLOAT DEFAULT 10.0,
                subtotal FLOAT DEFAULT 0.0,
                tax_amount FLOAT DEFAULT 0.0,
                grand_total FLOAT DEFAULT 0.0,
                commodity_id VARCHAR(20),
                product_name VARCHAR(200),
                batch_id VARCHAR(50),
                available_qty FLOAT DEFAULT 0.0,
                purchase_price FLOAT DEFAULT 0.0,
                delivery_cost FLOAT DEFAULT 0.0,
                manpower_percent FLOAT DEFAULT 0.0,
                management_percent FLOAT DEFAULT 0.0,
                margin_percent FLOAT DEFAULT 0.0,
                quote_price FLOAT DEFAULT 0.0,
                created_at DATETIME,
                updated_at DATETIME,
                deleted_at DATETIME
            )
        """))
        conn.execute(text("""
            INSERT INTO quotation_v2
            SELECT id, quotation_id, customer_name, customer_email, notes, status,
                   currency_code, exchange_rate, exchange_rate_timestamp, tax_percentage,
                   subtotal, tax_amount, grand_total,
                   commodity_id, product_name, batch_id,
                   available_qty, purchase_price, delivery_cost,
                   manpower_percent, management_percent, margin_percent, quote_price,
                   created_at, updated_at, deleted_at
            FROM quotation
        """))
        conn.execute(text("DROP TABLE quotation"))
        conn.execute(text("ALTER TABLE quotation_v2 RENAME TO quotation"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quotation_quotation_id ON quotation (quotation_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quotation_commodity_id ON quotation (commodity_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quotation_batch_id ON quotation (batch_id)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
        logger.info("quotation table rebuilt — legacy fields are now nullable")
    except Exception as e:
        logger.warning(f"_make_quotation_legacy_fields_nullable skipped: {e}")


def run_migrations(eng=None):
    """Idempotent ALTER TABLE migrations — run on every startup."""
    target = eng or engine
    migrations = [
        # Quotation: multi-currency + tax (v1.1)
        "ALTER TABLE quotation ADD COLUMN currency_code VARCHAR(10) DEFAULT 'IDR'",
        "ALTER TABLE quotation ADD COLUMN exchange_rate FLOAT DEFAULT 1.0",
        "ALTER TABLE quotation ADD COLUMN exchange_rate_timestamp DATETIME",
        "ALTER TABLE quotation ADD COLUMN tax_percentage FLOAT DEFAULT 10.0",
        "ALTER TABLE quotation ADD COLUMN tax_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE quotation ADD COLUMN grand_total FLOAT DEFAULT 0.0",
        # Invoice: currency + tax (v1.1)
        "ALTER TABLE invoice ADD COLUMN currency_code VARCHAR(10) DEFAULT 'IDR'",
        "ALTER TABLE invoice ADD COLUMN exchange_rate FLOAT DEFAULT 1.0",
        "ALTER TABLE invoice ADD COLUMN tax_percentage FLOAT DEFAULT 0.0",
        "ALTER TABLE invoice ADD COLUMN tax_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE invoice ADD COLUMN grand_total FLOAT DEFAULT 0.0",
        # Quotation: multi-product header fields (v1.2)
        "ALTER TABLE quotation ADD COLUMN subtotal FLOAT DEFAULT 0.0",
        # QC: new fields (v1.2)
        "ALTER TABLE qc ADD COLUMN product_grade VARCHAR(100)",
        "ALTER TABLE qc ADD COLUMN draft_status VARCHAR(20) DEFAULT 'Submitted'",
        "ALTER TABLE qc ADD COLUMN passed_qty FLOAT DEFAULT 0.0",
        "ALTER TABLE qc ADD COLUMN failed_qty FLOAT DEFAULT 0.0",
    ]
    with target.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore

        # SQLite table reconstruction: drop NOT NULL on quotation legacy fields
        _make_quotation_legacy_fields_nullable(conn)


def seed_quotation_details(eng=None):
    """
    One-time migration: create quotation_detail rows for existing single-product quotations
    that don't yet have detail records. Safe to run multiple times.
    """
    target = eng or engine
    with target.connect() as conn:
        try:
            # Find quotations with no detail rows
            rows = conn.execute(text("""
                SELECT q.quotation_id, q.commodity_id, q.product_name, q.batch_id,
                       q.available_qty, q.purchase_price, q.delivery_cost,
                       q.manpower_percent, q.management_percent, q.margin_percent,
                       q.quote_price, q.grand_total
                FROM quotation q
                LEFT JOIN quotation_detail d ON q.quotation_id = d.quotation_id AND d.deleted_at IS NULL
                WHERE q.deleted_at IS NULL
                  AND d.id IS NULL
                  AND q.batch_id IS NOT NULL
                  AND q.commodity_id IS NOT NULL
            """)).fetchall()

            for row in rows:
                pp = row[5] or 0.0
                dc = row[6] or 0.0
                cost_basis = pp + dc
                mp = row[7] or 0.0
                mgmt = row[8] or 0.0
                margin = row[9] or 0.0
                unit_price = row[10] or cost_basis
                qty = row[4] or 0.0
                line_sub = unit_price * qty
                conn.execute(text("""
                    INSERT INTO quotation_detail
                    (quotation_id, batch_id, commodity_id, product_name, available_qty,
                     quoted_qty, purchase_price, delivery_cost, extra_costs_total,
                     total_cost_basis, manpower_percent, management_percent, margin_percent,
                     unit_price, line_subtotal, created_at, updated_at)
                    VALUES (:qid, :bid, :cid, :pname, :avail,
                            :qty, :pp, :dc, 0.0,
                            :basis, :mp, :mgmt, :margin,
                            :uprice, :lsub, datetime('now'), datetime('now'))
                """), {
                    "qid": row[0], "bid": row[3], "cid": row[1],
                    "pname": row[2] or "", "avail": qty,
                    "qty": qty, "pp": pp, "dc": dc,
                    "basis": cost_basis, "mp": mp, "mgmt": mgmt, "margin": margin,
                    "uprice": unit_price, "lsub": line_sub,
                })
                conn.commit()
        except Exception as e:
            logger.warning(f"seed_quotation_details skipped: {e}")
