import os
import httpx
from dotenv import load_dotenv

load_dotenv()
BASE = "https://api-m.sandbox.paypal.com"
CLIENT_ID = os.environ["PAYPAL_CLIENT_ID"]
SECRET = os.environ["PAYPAL_SECRET"]


def _token() -> str:
    r = httpx.post(
        f"{BASE}/v1/oauth2/token",
        auth=(CLIENT_ID, SECRET),
        data={"grant_type": "client_credentials"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _headers() -> dict:
    return {"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"}


def _check(r: httpx.Response) -> httpx.Response:
    if r.status_code >= 400:
        print(r.text)
    r.raise_for_status()
    return r


def create_order(amount: str, seller_email: str) -> dict:
    body = {
        "intent": "AUTHORIZE",
        "purchase_units": [{
            "amount": {"currency_code": "USD", "value": amount},
            "payee": {"email_address": seller_email},
        }],
        "payment_source": {"paypal": {"experience_context": {
            "return_url": "http://localhost:8000/paypal/return",
            "cancel_url": "http://localhost:8000/paypal/cancel",
            "user_action": "PAY_NOW",
        }}},
    }
    r = _check(httpx.post(f"{BASE}/v2/checkout/orders", headers=_headers(), json=body, timeout=30))
    data = r.json()
    approve = next(
        l["href"] for l in data["links"] if l["rel"] in ("payer-action", "approve")
    )
    return {"order_id": data["id"], "approve_url": approve}


def authorize(order_id: str) -> str:
    r = _check(httpx.post(
        f"{BASE}/v2/checkout/orders/{order_id}/authorize",
        headers=_headers(), json={}, timeout=30,
    ))
    return r.json()["purchase_units"][0]["payments"]["authorizations"][0]["id"]


def capture(authorization_id: str, amount: str | None = None, final: bool = True) -> dict:
    body = {"final_capture": final}
    if amount:
        body["amount"] = {"currency_code": "USD", "value": amount}
    r = _check(httpx.post(
        f"{BASE}/v2/payments/authorizations/{authorization_id}/capture",
        headers=_headers(), json=body, timeout=30,
    ))
    return r.json()