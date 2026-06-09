from sqlalchemy.orm import Session


def generate_id(db: Session, model, id_field: str, prefix: str, width: int = 5) -> str:
    """Generate next sequential ID like KH00001, SU00001, etc."""
    last = (
        db.query(model)
        .order_by(getattr(model, "id").desc())
        .first()
    )
    if last is None:
        next_num = 1
    else:
        last_id = getattr(last, id_field)
        try:
            next_num = int(last_id[len(prefix):]) + 1
        except (ValueError, TypeError):
            next_num = 1
    return f"{prefix}{str(next_num).zfill(width)}"


def generate_batch_id(commodity_id: str, date_str: str, sequence: int) -> str:
    """Generate batch ID like KH00001-20240101-001"""
    return f"{commodity_id}-{date_str}-{str(sequence).zfill(3)}"
