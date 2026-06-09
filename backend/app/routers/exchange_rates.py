from fastapi import APIRouter, Depends
from datetime import datetime
from app.core.deps import get_current_user
from app.models.user import User
from app.services.exchange_rate_service import get_exchange_rates, SUPPORTED_CURRENCIES

router = APIRouter(prefix="/exchange-rates", tags=["Exchange Rates"])


@router.get("")
async def fetch_exchange_rates(current_user: User = Depends(get_current_user)):
    """
    Return latest BI mid-rate exchange rates against IDR.
    Mid Rate = (Buy Rate + Sell Rate) / 2
    Results are cached for 4 hours.
    """
    rates = await get_exchange_rates()
    return {
        "base_currency": "IDR",
        "rates": rates,
        "supported_currencies": ["IDR"] + SUPPORTED_CURRENCIES,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }
