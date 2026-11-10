import hashlib
import hmac
import json
import os
import queue
import secrets
import threading
import uuid
from pydantic import BaseModel
import policy_compiler
import time
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import catalog

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
POLICIES: dict[str, dict] = {}

# Anonymous browser identity. The cookie is a random id plus an HMAC signature, so it
# cannot be forged and needs no user table. The secret comes from the environment only.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_urlsafe(32)
    print("WARNING: SESSION_SECRET is not set. Using an ephemeral secret; browser "
          "identities will not survive a restart until SESSION_SECRET is configured.")
COOKIE_NAME = "haggle_uid"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365
COOKIE_SECURE = (
    os.environ.get("PUBLIC_BASE_URL", "").startswith("https://")
    or os.environ.get("FRONTEND_URL", "").startswith("https://")
)


def sign_user(user_id: str) -> str:
    """`<id>.<hmac>` — an opaque, tamper-evident identity for one browser."""
    digest = hmac.new(SESSION_SECRET.encode(), user_id.encode(), hashlib.sha256).hexdigest()
    return f"{user_id}.{digest}"


def read_signed_user(value: str | None) -> str | None:
    """Return the user id only when the signature matches; anything else is anonymous."""
    if not value or "." not in value:
        return None
    user_id, _, digest = value.rpartition(".")
    if not user_id or not digest:
        return None
    expected = hmac.new(SESSION_SECRET.encode(), user_id.encode(), hashlib.sha256).hexdigest()
    return user_id if hmac.compare_digest(digest, expected) else None


REPLAY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "replay.json")


def play_replay(emit):
    with open(REPLAY_PATH) as f:
        events = json.load(f)
    for e in events:
        emit(e)
        time.sleep(0.8 if e["type"] == "offer" else 0.3)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in {"http://localhost:3000", FRONTEND_URL} if o],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    # The browser identity is a cookie, so cross-origin dev requests need credentials.
    allow_credentials=True,
)


@app.middleware("http")
async def identify_user(request: Request, call_next):
    """Give every API visitor a signed anonymous id, and read it back on later calls."""
    user_id = read_signed_user(request.cookies.get(COOKIE_NAME))
    issued = user_id is None
    if issued:
        user_id = secrets.token_hex(16)
    request.state.user_id = user_id

    response = await call_next(request)

    path = request.url.path
    if issued and (path.startswith("/api/") or path.startswith("/paypal/")):
        response.set_cookie(
            COOKIE_NAME,
            sign_user(user_id),
            max_age=COOKIE_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=COOKIE_SECURE,
            path="/",
        )
    return response


def owned_deal(deal_id: str, request: Request) -> dict:
    """A deal only exists for its owner; another browser gets the same 404 as a bad id."""
    d = DEALS.get(deal_id)
    if not d or d.get("user_id") != request.state.user_id:
        raise HTTPException(404, "unknown deal")
    return d


def public(d: dict) -> dict:
    keys = ("deal_id", "seller", "item", "price", "deposit_percent", "delivery_days",
            "list_price", "total", "deposit", "balance", "status")
    return {k: d[k] for k in keys}


@app.get("/api/negotiate")
def negotiate(request: Request, budget: float = 90, target: float = 85,
              item: str = "a 27-inch monitor",
              policy_id: str | None = None, replay: bool = False,
              prices: str | None = None):
    if not (0 < target <= budget):
        raise HTTPException(400, "target must be positive and not above budget")
    sellers = [dict(s) for s in market.SELLERS]
    if prices:
        try:
            overrides = json.loads(prices)
        except ValueError:
            raise HTTPException(400, "prices must be valid JSON")
        if not isinstance(overrides, dict):
            raise HTTPException(400, "prices must be an object")
        for s in sellers:
            o = overrides.get(s["name"])
            if o is None:
                continue
            try:
                lp, fl = float(o["list"]), float(o["floor"])
            except (KeyError, TypeError, ValueError):
                raise HTTPException(400, f'bad prices for {s["name"]}')
            if not (0 < fl <= lp <= 1_000_000):
                raise HTTPException(400, f'floor must be above 0 and not above list for {s["name"]}')
            s["list_price"], s["floor"] = round(lp, 2), round(fl, 2)
            if "delivery_days" in o:
                try:
                    delivery = int(o["delivery_days"])
                except (TypeError, ValueError):
                    raise HTTPException(400, f'bad delivery days for {s["name"]}')
                if not (1 <= delivery <= 30):
                    raise HTTPException(
                        400, f'delivery days must be between 1 and 30 for {s["name"]}'
                    )
                s["delivery_days"] = delivery
    if policy_id:
        p = POLICIES.get(policy_id)
        if not p:
            raise HTTPException(404, "unknown policy")
        name = p["name"]
        if name in {s["name"] for s in sellers}:
            name += " (You)"
        sellers.append({"name": name, "personality": p["personality"],
                        "list_price": p["list_price"], "floor": p["floor"],
                        "delivery_days": p["delivery_days"],
                        "deposit_percent": p["deposit_percent"]})
    mandate = {**market.MANDATE, "item": item, "budget": budget, "target": target}
    # Captured before streaming starts: the response that sets the cookie is still ours.
    owner = request.state.user_id
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
                "order_id": None, "auth_id": None, "user_id": owner,
            }
            e = {**e, "deal_id": deal_id}
        q.put(e)

    def worker():
        try:
            if replay:
                play_replay(emit)
            else:
                market.run(sellers=sellers, mandate=mandate, emit=emit)
        except Exception as ex:
            if os.path.exists(REPLAY_PATH):
                q.put({"type": "reset"})
                q.put({"type": "notice",
                       "message": "Live models are busy, so this is a recorded negotiation."})
                try:
                    play_replay(emit)
                except Exception as ex2:
                    q.put({"type": "error", "message": str(ex2)[:200]})
            else:
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


@app.get("/api/deals")
def list_deals(request: Request, limit: int = 20):
    if not (1 <= limit <= 100):
        raise HTTPException(400, "limit must be between 1 and 100")
    # DEALS keeps insertion order, so the tail holds the newest deals. A deal is only
    # listed for the browser that owns it.
    mine = [d for d in DEALS.values() if d.get("user_id") == request.state.user_id]
    return [public(d) for d in reversed(mine[-limit:])]


@app.get("/api/deals/{deal_id}")
def get_deal(deal_id: str, request: Request):
    return public(owned_deal(deal_id, request))


@app.post("/api/deals/{deal_id}/pay")
def pay(deal_id: str, request: Request):
    d = owned_deal(deal_id, request)
    if d["status"] != "negotiated":
        raise HTTPException(409, f'deal is already {d["status"]}')
    email = SELLER_EMAILS.get(d["seller"]) or os.environ.get("SELLER_EMAIL_CUSTOM")
    if not email:
        raise HTTPException(500, f'no sandbox email configured for {d["seller"]}')
    # PayPal's return carries a signed owner token, so only the initiating browser can
    # complete (and capture) this order.
    o = pp.create_order(f'{d["total"]:.2f}', email, return_state=sign_user(d["user_id"]))
    d["order_id"], d["status"] = o["order_id"], "awaiting_approval"
    return {"approve_url": o["approve_url"]}


@app.get("/paypal/return")
def paypal_return(token: str, state: str | None = None):
    user_id = read_signed_user(state)
    d = next((x for x in DEALS.values() if x["order_id"] == token), None)
    if not d or not user_id or d.get("user_id") != user_id:
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
def deliver(deal_id: str, request: Request):
    d = owned_deal(deal_id, request)
    if d["status"] != "deposit_paid":
        raise HTTPException(409, f'cannot release balance while deal is {d["status"]}')
    pp.capture(d["auth_id"], f'{d["balance"]:.2f}', final=True)
    d["status"] = "complete"
    return public(d)

class RulesIn(BaseModel):
    rules: str


@app.post("/api/policy/compile")
@app.post("/api/policy/compile")
def compile_policy(body: RulesIn):
    if not body.rules.strip() or len(body.rules) > 2000:
        raise HTTPException(400, "rules must be 1 to 2000 characters")
    policy = policy_compiler.compile_rules(body.rules)
    pid = uuid.uuid4().hex[:12]
    POLICIES[pid] = policy
    return {**policy, "policy_id": pid}
@app.get("/api/products")
def products():
    return catalog.PRODUCTS


class ManualPolicyIn(BaseModel):
    name: str
    list_price: float
    floor: float
    deposit_percent: float = 30
    delivery_days: int = 3
    personality: str = "friendly but firm"


@app.post("/api/policy/manual")
def manual_policy(body: ManualPolicyIn):
    if not (0 < body.floor <= body.list_price <= 1_000_000):
        raise HTTPException(400, "floor must be above 0 and not above the list price")
    policy = {
        "name": (body.name.strip() or "Your Shop")[:40],
        "list_price": round(body.list_price, 2),
        "floor": round(body.floor, 2),
        "deposit_percent": min(max(body.deposit_percent, 0.0), 100.0),
        "delivery_days": min(max(body.delivery_days, 1), 30),
        "personality": body.personality.strip()[:120] or "friendly but firm",
        "notes": "Created from the form.",
    }
    pid = uuid.uuid4().hex[:12]
    POLICIES[pid] = policy
    return {**policy, "policy_id": pid}

OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
if os.path.isdir(OUT):  # must stay last so it never shadows the routes above
    app.mount("/", StaticFiles(directory=OUT, html=True), name="web")