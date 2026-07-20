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
        # Command Center v2: new columns on existing tables
        "ALTER TABLE cc_tasks ADD COLUMN start_date DATE",
        "ALTER TABLE cc_comments ADD COLUMN parent_id INTEGER",
        "ALTER TABLE cc_comments ADD COLUMN edited_at DATETIME",
        # Command Center v2.1: multiple assignees + ERP workflow linkage
        "ALTER TABLE cc_tasks ADD COLUMN related_module VARCHAR(50)",
        "ALTER TABLE cc_tasks ADD COLUMN related_record_id VARCHAR(50)",
        "ALTER TABLE cc_tasks ADD COLUMN related_record_number VARCHAR(50)",
    ]

    # Indexes run separately — CREATE INDEX IF NOT EXISTS is always safe
    indexes = [
        "CREATE INDEX IF NOT EXISTS ix_cc_tasks_assigned_to ON cc_tasks (assigned_to)",
        "CREATE INDEX IF NOT EXISTS ix_cc_tasks_status_id ON cc_tasks (status_id)",
        "CREATE INDEX IF NOT EXISTS ix_cc_tasks_category_id ON cc_tasks (category_id)",
        "CREATE INDEX IF NOT EXISTS ix_cc_tasks_due_date ON cc_tasks (due_date)",
        "CREATE INDEX IF NOT EXISTS ix_cc_tasks_created_at ON cc_tasks (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_cc_tasks_related_module ON cc_tasks (related_module)",
        "CREATE INDEX IF NOT EXISTS ix_cc_notifications_user_id ON cc_notifications (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_cc_notifications_task_id ON cc_notifications (task_id)",
        "CREATE INDEX IF NOT EXISTS ix_cc_notifications_is_read ON cc_notifications (is_read)",
        "CREATE INDEX IF NOT EXISTS ix_cc_task_assignees_task_id ON cc_task_assignees (task_id)",
        "CREATE INDEX IF NOT EXISTS ix_cc_task_assignees_user_id ON cc_task_assignees (user_id)",
    ]

    with target.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore

        for sql in indexes:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Table may not exist yet on first boot — Base.metadata.create_all runs after

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


def seed_command_center_defaults(eng=None):
    """Seed default CC lookup tables on first startup. Idempotent."""
    target = eng or engine
    with target.connect() as conn:
        try:
            # Business-specific categories — seed on fresh install, upsert-by-name on existing
            REQUIRED_CATS = [
                ("Sourcing",        "#0891B2", "bi-search",                 1),
                ("Quotation",       "#1D4ED8", "bi-file-earmark-text",      2),
                ("Development",     "#7C3AED", "bi-code-slash",             3),
                ("Proposal",        "#0F766E", "bi-file-earmark-richtext",  4),
                ("Invoicing",       "#B45309", "bi-receipt",                5),
                ("Operations",      "#059669", "bi-gear",                   6),
                ("Procurement",     "#0284C7", "bi-cart3",                  7),
                ("Finance",         "#1D4ED8", "bi-cash-coin",              8),
                ("Warehouse",       "#78350F", "bi-building",               9),
                ("Quality Control", "#7C3AED", "bi-clipboard-check",       10),
                ("Administration",  "#6B7280", "bi-person-badge",          11),
                ("Meetings",        "#BE185D", "bi-calendar-event",        12),
                ("Others",          "#374151", "bi-tag",                   13),
            ]
            cat_count = conn.execute(text("SELECT COUNT(*) FROM cc_categories")).scalar()
            if cat_count == 0:
                for i, (name, color, icon, sort) in enumerate(REQUIRED_CATS, 1):
                    conn.execute(text(
                        "INSERT INTO cc_categories (id, name, color, icon, sort_order) VALUES (:id, :n, :c, :i, :s)"
                    ), {"id": i, "n": name, "c": color, "i": icon, "s": sort})
                conn.commit()
            else:
                added = 0
                for name, color, icon, sort in REQUIRED_CATS:
                    exists = conn.execute(
                        text("SELECT 1 FROM cc_categories WHERE name = :n AND deleted_at IS NULL"), {"n": name}
                    ).scalar()
                    if not exists:
                        conn.execute(text(
                            "INSERT INTO cc_categories (name, color, icon, sort_order) VALUES (:n, :c, :i, :s)"
                        ), {"n": name, "c": color, "i": icon, "s": sort})
                        added += 1
                if added:
                    conn.commit()

            pri_count = conn.execute(text("SELECT COUNT(*) FROM cc_priorities")).scalar()
            if pri_count == 0:
                priorities = [
                    (1, "Critical", "#DC2626", 1),
                    (2, "High",     "#EA580C", 2),
                    (3, "Medium",   "#D97706", 3),
                    (4, "Low",      "#16A34A", 4),
                ]
                for row in priorities:
                    conn.execute(text(
                        "INSERT INTO cc_priorities (id, name, color, sort_order) VALUES (:id, :n, :c, :s)"
                    ), {"id": row[0], "n": row[1], "c": row[2], "s": row[3]})
                conn.commit()

            st_count = conn.execute(text("SELECT COUNT(*) FROM cc_statuses")).scalar()
            if st_count == 0:
                statuses = [
                    (1, "Requested",        "#4F46E5", False, 1),
                    (2, "Assigned",         "#0284C7", False, 2),
                    (3, "In Progress",      "#B45309", False, 3),
                    (4, "Follow Up",        "#7C3AED", False, 4),
                    (5, "Waiting Approval", "#BE185D", False, 5),
                    (6, "On Hold",          "#6B7280", False, 6),
                    (7, "Cancelled",        "#DC2626", True,  7),
                    (8, "Completed",        "#059669", True,  8),
                    (9, "Archived",         "#374151", True,  9),
                ]
                for row in statuses:
                    conn.execute(text(
                        "INSERT INTO cc_statuses (id, name, color, is_terminal, sort_order) VALUES (:id, :n, :c, :t, :s)"
                    ), {"id": row[0], "n": row[1], "c": row[2], "t": row[3], "s": row[4]})
                conn.commit()

            label_count = conn.execute(text("SELECT COUNT(*) FROM cc_labels")).scalar()
            if label_count == 0:
                default_labels = [
                    ("Urgent",      "#DC2626"),
                    ("Vendor",      "#EA580C"),
                    ("Finance",     "#1D4ED8"),
                    ("Operations",  "#059669"),
                    ("Procurement", "#7C3AED"),
                    ("Export",      "#0284C7"),
                    ("Inspection",  "#BE185D"),
                    ("Proposal",    "#0F766E"),
                ]
                for name, color in default_labels:
                    conn.execute(text(
                        "INSERT INTO cc_labels (name, color) VALUES (:n, :c)"
                    ), {"n": name, "c": color})
                conn.commit()

            # Upsert "Waiting Vendor" status (added v1.3)
            wv = conn.execute(
                text("SELECT 1 FROM cc_statuses WHERE name = 'Waiting Vendor' AND deleted_at IS NULL")
            ).scalar()
            if not wv:
                conn.execute(text(
                    "INSERT INTO cc_statuses (name, color, is_terminal, sort_order) "
                    "VALUES ('Waiting Vendor', '#0284C7', 0, 55)"
                ))
                conn.commit()

            import os
            os.makedirs("uploads/cc_attachments", exist_ok=True)
            logger.info("Command Center seed complete")
        except Exception as e:
            logger.warning(f"seed_command_center_defaults skipped: {e}")


def seed_rbac_defaults(eng=None):
    """Seed default RBAC roles and menu permissions. Idempotent."""
    target = eng or engine

    MENU_CODES = [
        "dashboard", "command_center",
        "products", "suppliers", "users",
        "receiving", "qc", "qc_failed", "inventory", "stock_opname",
        "quotation", "invoice", "settings",
    ]

    # (name, description, color, is_system, sort_order)
    SYSTEM_ROLES = [
        ("Administrator", "Full system access",                    "#DC2626", True, 1),
        ("Manager",       "Team lead with approval authority",     "#EA580C", True, 2),
        ("CEO",           "Executive overview and approvals",      "#1D4ED8", True, 3),
        ("Staff",         "Day-to-day operational staff",         "#059669", True, 4),
        ("Viewer",        "Read-only access across all modules",  "#6B7280", True, 5),
    ]

    # (can_view, can_create, can_edit, can_delete, can_approve, can_export)
    PERM_MATRIX = {
        "Administrator": {mc: (1, 1, 1, 1, 1, 1) for mc in MENU_CODES},
        "Manager": {
            "dashboard":      (1, 0, 0, 0, 0, 1),
            "command_center": (1, 1, 1, 0, 1, 0),
            "products":       (1, 1, 1, 0, 0, 1),
            "suppliers":      (1, 1, 1, 0, 0, 1),
            "users":          (0, 0, 0, 0, 0, 0),
            "receiving":      (1, 1, 1, 0, 1, 1),
            "qc":             (1, 1, 1, 0, 1, 1),
            "qc_failed":      (1, 0, 0, 0, 0, 0),
            "inventory":      (1, 0, 0, 0, 0, 1),
            "stock_opname":   (1, 1, 1, 0, 1, 1),
            "quotation":      (1, 1, 1, 0, 1, 1),
            "invoice":        (1, 1, 1, 0, 1, 1),
            "settings":       (0, 0, 0, 0, 0, 0),
        },
        "CEO": {
            "dashboard":      (1, 0, 0, 0, 0, 1),
            "command_center": (1, 1, 1, 0, 1, 0),
            "products":       (1, 0, 0, 0, 0, 1),
            "suppliers":      (1, 0, 0, 0, 0, 1),
            "users":          (1, 0, 0, 0, 0, 0),
            "receiving":      (1, 0, 0, 0, 1, 1),
            "qc":             (1, 0, 0, 0, 1, 1),
            "qc_failed":      (1, 0, 0, 0, 0, 0),
            "inventory":      (1, 0, 0, 0, 0, 1),
            "stock_opname":   (1, 0, 0, 0, 1, 1),
            "quotation":      (1, 0, 0, 0, 1, 1),
            "invoice":        (1, 0, 0, 0, 1, 1),
            "settings":       (0, 0, 0, 0, 0, 0),
        },
        "Staff": {
            "dashboard":      (1, 0, 0, 0, 0, 0),
            "command_center": (1, 1, 1, 0, 0, 0),
            "products":       (1, 0, 0, 0, 0, 0),
            "suppliers":      (1, 0, 0, 0, 0, 0),
            "users":          (0, 0, 0, 0, 0, 0),
            "receiving":      (1, 1, 1, 0, 0, 0),
            "qc":             (1, 1, 1, 0, 0, 0),
            "qc_failed":      (1, 0, 0, 0, 0, 0),
            "inventory":      (1, 0, 0, 0, 0, 0),
            "stock_opname":   (1, 1, 1, 0, 0, 0),
            "quotation":      (1, 1, 1, 0, 0, 0),
            "invoice":        (1, 0, 0, 0, 0, 0),
            "settings":       (0, 0, 0, 0, 0, 0),
        },
        "Viewer": {
            mc: (1 if mc not in ("users", "settings") else 0, 0, 0, 0, 0, 0)
            for mc in MENU_CODES
        },
    }

    with target.connect() as conn:
        try:
            for name, desc, color, is_sys, sort in SYSTEM_ROLES:
                exists = conn.execute(
                    text("SELECT 1 FROM roles WHERE name = :n AND deleted_at IS NULL"), {"n": name}
                ).scalar()
                if not exists:
                    conn.execute(text(
                        "INSERT INTO roles (name, description, color, is_system, sort_order, created_at, updated_at) "
                        "VALUES (:n, :d, :c, :s, :o, datetime('now'), datetime('now'))"
                    ), {"n": name, "d": desc, "c": color, "s": int(is_sys), "o": sort})
                    conn.commit()

                perms = PERM_MATRIX.get(name, {})
                for mc in MENU_CODES:
                    already = conn.execute(
                        text("SELECT 1 FROM menu_permissions WHERE role_name = :r AND menu_code = :m"),
                        {"r": name, "m": mc},
                    ).scalar()
                    if not already:
                        tup = perms.get(mc, (0, 0, 0, 0, 0, 0))
                        conn.execute(text(
                            "INSERT INTO menu_permissions "
                            "(role_name, menu_code, can_view, can_create, can_edit, can_delete, can_approve, can_export) "
                            "VALUES (:r, :m, :v, :c, :e, :d, :a, :x)"
                        ), {"r": name, "m": mc, "v": int(tup[0]), "c": int(tup[1]),
                            "e": int(tup[2]), "d": int(tup[3]), "a": int(tup[4]), "x": int(tup[5])})
                conn.commit()

            logger.info("RBAC seed complete")
        except Exception as ex:
            logger.warning(f"seed_rbac_defaults skipped: {ex}")


def seed_workflow_defaults(eng=None):
    """
    Seed default ERP → Command Center workflow rules.
    One rule per (module, event) pair. Idempotent.
    Category / Priority IDs are resolved by name at seed time.
    """
    target = eng or engine

    DEFAULTS = [
        # (module, event, title_template, category_name, priority_name, assign_to_role)
        ("quotation",    "created",     "Review Quotation {record_number}",       "Quotation",       "High",   "Manager"),
        ("invoice",      "created",     "Approve Invoice {record_number}",         "Invoicing",       "High",   "Manager"),
        ("receiving",    "created",     "Verify Receiving {record_number}",        "Warehouse",       "Medium", "Staff"),
        ("stock_opname", "discrepancy", "Investigate Stock Discrepancy {record_number}", "Warehouse", "High",   "Manager"),
    ]

    with target.connect() as conn:
        try:
            for module, event, title_tpl, cat_name, pri_name, role in DEFAULTS:
                # Skip if this (module, event) rule already exists
                existing = conn.execute(
                    text("SELECT 1 FROM workflow_rules WHERE module_name=:m AND event_name=:e"),
                    {"m": module, "e": event},
                ).scalar()
                if existing:
                    continue

                # Resolve IDs
                cat_id = conn.execute(
                    text("SELECT id FROM cc_categories WHERE name=:n AND deleted_at IS NULL LIMIT 1"),
                    {"n": cat_name},
                ).scalar()
                pri_id = conn.execute(
                    text("SELECT id FROM cc_priorities WHERE name=:n LIMIT 1"),
                    {"n": pri_name},
                ).scalar()

                conn.execute(text(
                    "INSERT INTO workflow_rules "
                    "(module_name, event_name, task_title_template, category_id, priority_id, "
                    " assign_to_role, is_active, created_at, updated_at) "
                    "VALUES (:m, :e, :t, :c, :p, :r, 1, datetime('now'), datetime('now'))"
                ), {"m": module, "e": event, "t": title_tpl, "c": cat_id, "p": pri_id, "r": role})
                conn.commit()

            logger.info("Workflow rule seed complete")
        except Exception as ex:
            logger.warning(f"seed_workflow_defaults skipped: {ex}")
