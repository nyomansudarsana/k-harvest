from datetime import datetime
from sqlalchemy.orm import Session
from app.models.inventory import Inventory
from app.models.stock_movement import StockMovement
from app.utils.id_generator import generate_id


def get_or_create_inventory(db: Session, commodity_id: str, product_name: str, batch_id: str) -> Inventory:
    inv = db.query(Inventory).filter(
        Inventory.batch_id == batch_id,
        Inventory.deleted_at.is_(None),
    ).first()
    if not inv:
        inv_id = generate_id(db, Inventory, "inventory_id", "INV", 5)
        inv = Inventory(
            inventory_id=inv_id,
            commodity_id=commodity_id,
            product_name=product_name,
            batch_id=batch_id,
            available_qty=0.0,
            reserved_qty=0.0,
        )
        db.add(inv)
        db.flush()
    return inv


def record_movement(
    db: Session,
    commodity_id: str,
    batch_id: str,
    movement_type: str,
    qty_in: float,
    qty_out: float,
    balance: float,
    reference_id: str = None,
    remarks: str = None,
) -> StockMovement:
    sm_id = generate_id(db, StockMovement, "movement_id", "SM", 5)
    movement = StockMovement(
        movement_id=sm_id,
        date=datetime.utcnow(),
        commodity_id=commodity_id,
        batch_id=batch_id,
        movement_type=movement_type,
        qty_in=qty_in,
        qty_out=qty_out,
        balance=balance,
        reference_id=reference_id,
        remarks=remarks,
    )
    db.add(movement)
    return movement


def add_stock(
    db: Session,
    commodity_id: str,
    product_name: str,
    batch_id: str,
    quantity: float,
    movement_type: str,
    reference_id: str = None,
    remarks: str = None,
) -> Inventory:
    inv = get_or_create_inventory(db, commodity_id, product_name, batch_id)
    inv.available_qty += quantity
    inv.last_movement_date = datetime.utcnow()
    record_movement(
        db, commodity_id, batch_id, movement_type,
        qty_in=quantity, qty_out=0.0, balance=inv.available_qty,
        reference_id=reference_id, remarks=remarks,
    )
    return inv


def deduct_stock(
    db: Session,
    commodity_id: str,
    batch_id: str,
    quantity: float,
    movement_type: str,
    reference_id: str = None,
    remarks: str = None,
) -> Inventory:
    inv = db.query(Inventory).filter(
        Inventory.batch_id == batch_id,
        Inventory.deleted_at.is_(None),
    ).first()
    if not inv:
        raise ValueError(f"Inventory batch {batch_id} not found")
    if inv.available_qty < quantity:
        raise ValueError(f"Insufficient stock. Available: {inv.available_qty}, Requested: {quantity}")
    inv.available_qty -= quantity
    inv.last_movement_date = datetime.utcnow()
    record_movement(
        db, commodity_id, batch_id, movement_type,
        qty_in=0.0, qty_out=quantity, balance=inv.available_qty,
        reference_id=reference_id, remarks=remarks,
    )
    return inv


def adjust_stock(
    db: Session,
    commodity_id: str,
    product_name: str,
    batch_id: str,
    system_qty: float,
    physical_qty: float,
    reference_id: str = None,
    remarks: str = None,
) -> Inventory:
    inv = get_or_create_inventory(db, commodity_id, product_name, batch_id)
    diff = physical_qty - system_qty
    inv.available_qty = physical_qty
    inv.last_movement_date = datetime.utcnow()
    record_movement(
        db, commodity_id, batch_id, "Stock Opname",
        qty_in=max(diff, 0), qty_out=abs(min(diff, 0)),
        balance=physical_qty, reference_id=reference_id, remarks=remarks,
    )
    return inv
