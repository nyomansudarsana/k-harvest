"""
Exchange rate service — fetches BI (Bank Indonesia) mid rates with fallback.

Mid Rate = (BI Buy Rate + BI Sell Rate) / 2

Primary source : Bank Indonesia SOAP web service
Fallback source: open.er-api.com (free, no key required)
Cache TTL      : 4 hours
"""
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Dict, Optional

import httpx

logger = logging.getLogger(__name__)

SUPPORTED_CURRENCIES = ["USD", "EUR", "AUD", "SGD", "JPY", "GBP", "MYR", "THB"]

BI_SOAP_URL = "https://www.bi.go.id/biwebservice/wss/BIWebService.asmx"
FALLBACK_URL = "https://open.er-api.com/v6/latest/IDR"

CACHE_TTL = timedelta(hours=4)
_cache: Optional[Dict] = None
_cache_time: Optional[datetime] = None


def _is_cache_valid() -> bool:
    return (
        _cache is not None
        and _cache_time is not None
        and datetime.utcnow() - _cache_time < CACHE_TTL
    )


def _build_soap_body(date_str: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
        'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
        "<soap:Body>"
        '<getKursBI xmlns="https://www.bi.go.id">'
        f"<startdate>{date_str}</startdate>"
        f"<enddate>{date_str}</enddate>"
        "</getKursBI>"
        "</soap:Body>"
        "</soap:Envelope>"
    )


async def _fetch_bi_rates() -> Optional[Dict]:
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                BI_SOAP_URL,
                content=_build_soap_body(today).encode("utf-8"),
                headers={
                    "Content-Type": "text/xml; charset=utf-8",
                    "SOAPAction": "https://www.bi.go.id/getKursBI",
                },
            )
            if resp.status_code != 200:
                return None
            root = ET.fromstring(resp.text)
            rates: Dict = {}
            # BI SOAP wraps result in diffgram or Table elements
            for table in root.iter("Table"):
                code_el = table.find("m_kodinst")
                buy_el = table.find("m_kurs_beli")
                sell_el = table.find("m_kurs_jual")
                if code_el is None:
                    continue
                code = (code_el.text or "").strip()
                if code not in SUPPORTED_CURRENCIES:
                    continue
                try:
                    buy = float(buy_el.text or 0) if buy_el is not None else 0.0
                    sell = float(sell_el.text or 0) if sell_el is not None else 0.0
                    mid = (buy + sell) / 2.0 if buy > 0 and sell > 0 else 0.0
                    if mid > 0:
                        rates[code] = {
                            "buy": round(buy, 2),
                            "sell": round(sell, 2),
                            "mid": round(mid, 2),
                            "source": "Bank Indonesia",
                        }
                except (ValueError, TypeError):
                    continue
            return rates if rates else None
    except Exception as exc:
        logger.debug("BI SOAP fetch failed: %s", exc)
        return None


async def _fetch_fallback_rates() -> Optional[Dict]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(FALLBACK_URL)
            if resp.status_code != 200:
                return None
            data = resp.json()
            raw = data.get("rates", {})
            rates: Dict = {}
            for code in SUPPORTED_CURRENCIES:
                r = raw.get(code)
                if r and r > 0:
                    idr = 1.0 / r
                    # Simulate a ±0.5 % buy/sell spread around the mid rate
                    rates[code] = {
                        "buy": round(idr * 0.995, 2),
                        "sell": round(idr * 1.005, 2),
                        "mid": round(idr, 2),
                        "source": "Market Rate (open.er-api.com)",
                    }
            return rates if rates else None
    except Exception as exc:
        logger.debug("Fallback rate fetch failed: %s", exc)
        return None


async def get_exchange_rates() -> Dict:
    """Return cached or freshly fetched exchange rates keyed by currency code."""
    global _cache, _cache_time

    if _is_cache_valid():
        return _cache  # type: ignore[return-value]

    rates = await _fetch_bi_rates()
    if not rates:
        rates = await _fetch_fallback_rates()

    if not rates:
        # Return stale cache if available, else empty
        return _cache or {}

    _cache = {
        "IDR": {"buy": 1.0, "sell": 1.0, "mid": 1.0, "source": "Base Currency"},
        **rates,
    }
    _cache_time = datetime.utcnow()
    return _cache
