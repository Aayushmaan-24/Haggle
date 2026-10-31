import json
import os
import queue
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import market  # noqa: E402
import paypal_service as pp  # noqa: E402

FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
SELLER_EMAILS = {
    "Firm Co": os.environ.get("SELLER_EMAIL_FIRM_CO"),
    "Flex Ltd": os.environ.get("SELLER_EMAIL_FLEX_LTD"),
    "Premium Hub": os.environ.get("SELLER_EMAIL_PREMIUM_HUB"),
}
DEALS: dict[str, dict] = {}  # in-memory: Render's free disk is ephemeral

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in {"http://localhost:3000", FRONTEND_URL} if o],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def public(d: dict) -> dict:
    keys = ("deal_id", "seller", "item", "price", "deposit_percent", "delivery_days",
            "list_price", "total", "deposit", "balance", "status")
    return {k: d[k] for k in keys}


@app.get("/api/negotiate")
def negotiate(budget: float = 90, target: float = 85, item: str = "a 27-inch monitor"):
    if not (0 < target <= budget):
        raise HTTPException(400, "target must be positive and not above budget")
    mandate = {**market.MANDATE, "item": item, "budget": budget, "target": target}
    q: queue.Queue = queue.Queue()

    def emit(e):
        if e["type"] == "result" and e["winner"]:
            w = e["winner"]
            total = round(float(w["price"]), 2)
            deposit = round(total * float(w["deposit_percent"]) / 100, 2)
            deal_id = uuid.uuid4().hex[:12]
            DEALS[deal_id] = {
                "deal_id": deal_id, "seller": w["seller"], "item": item, "price": w["price"],
                "deposit_percent": w["deposit_percent"], "delivery_days": w["delivery_days"],
                "list_price": e["list_price"], "total": total, "deposit": deposit,
                "balance": round(total - deposit, 2), "status": "negotiated",
                "order_id": None, "auth_id": None,
            }
            e = {**e, "deal_id": deal_id}
        q.put(e)

    def worker():
        try:
            market.run(mandate=mandate, emit=emit)
        except Exception as ex:
            q.put({"type": "error", "message": str(ex)[:200]})
        q.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def stream():
        while True:
            e = q.get()
            if e is None:
                break
            yield f"data: {json.dumps(e)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/deals/{deal_id}")
def get_deal(deal_id: str):
    d = DEALS.get(deal_id)
    if not d:
        raise HTTPException(404, "unknown deal")
    return public(d)


@app.post("/api/deals/{deal_id}/pay")
def pay(deal_id: str):
    d = DEALS.get(deal_id)
    if not d:
        raise HTTPException(404, "unknown deal")
    if d["status"] != "negotiated":
        raise HTTPException(409, f'deal is already {d["status"]}')
    email = SELLER_EMAILS.get(d["seller"])
    if not email:
        raise HTTPException(500, f'no sandbox email configured for {d["seller"]}')
    o = pp.create_order(f'{d["total"]:.2f}', email)
    d["order_id"], d["status"] = o["order_id"], "awaiting_approval"
    return {"approve_url": o["approve_url"]}


@app.get("/paypal/return")
def paypal_return(token: str):
    d = next((x for x in DEALS.values() if x["order_id"] == token), None)
    if not d:
        raise HTTPException(404, "unknown order")
    if d["status"] == "awaiting_approval":
        d["auth_id"] = pp.authorize(token)
        pp.capture(d["auth_id"], f'{d["deposit"]:.2f}', final=d["balance"] <= 0)
        d["status"] = "deposit_paid" if d["balance"] > 0 else "complete"
    return RedirectResponse(f'{FRONTEND_URL}/receipt?deal={d["deal_id"]}')


@app.get("/paypal/cancel")
def paypal_cancel():
    return RedirectResponse(f"{FRONTEND_URL}/?cancelled=1")


@app.post("/api/deals/{deal_id}/deliver")
def deliver(deal_id: str):
    d = DEALS.get(deal_id)
    if not d:
        raise HTTPException(404, "unknown deal")
    if d["status"] != "deposit_paid":
        raise HTTPException(409, f'cannot release balance while deal is {d["status"]}')
    pp.capture(d["auth_id"], f'{d["balance"]:.2f}', final=True)
    d["status"] = "complete"
    return public(d)


OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
if os.path.isdir(OUT):  # must stay last so it never shadows the routes above
    app.mount("/", StaticFiles(directory=OUT, html=True), name="web")