import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
import time
import threading

load_dotenv("../.env")
client = genai.Client(
    api_key=os.environ["GEMINI_API_KEY"],
    http_options=types.HttpOptions(timeout=12000),  # 20 seconds per call
)
MODEL = os.environ["GEMINI_MODEL"]
MODELS = [MODEL, "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]

SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["counter", "accept", "walk_away"]},
        "price": {"type": "number"},
        "deposit_percent": {"type": "number"},
        "delivery_days": {"type": "integer"},
        "message": {"type": "string"},
    },
    "required": ["action", "price", "deposit_percent", "delivery_days", "message"],
}

GATE = threading.Semaphore(2)  # at most 2 calls
def ask(system: str, prompt: str, schema: dict = SCHEMA) -> dict:
    last = None
    for model in MODELS:
        for attempt in range(3):
            t0 = time.time()
            try:
                with GATE:
                    r = client.models.generate_content(
                        model=model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system,
                            response_mime_type="application/json",
                            response_schema=schema,
                            temperature=0.7,
                        ),
                    )
                print(f"   [{model} {time.time() - t0:.1f}s]")
                return json.loads(r.text)
            except Exception as e:
                last = e
                msg = str(e)
                print(f"   [retry] {model} attempt {attempt + 1} after {time.time() - t0:.1f}s: {msg[:70]}")
                if any(k in msg for k in ("503", "429", "UNAVAILABLE", "timed out", "Timeout", "DEADLINE")):
                    time.sleep(2 ** attempt)
                    continue
                raise
    raise last

def render(history) -> str:
    return "\n".join(
        f'{who.upper()}: ${o["price"]}, {o["deposit_percent"]}% deposit, '
        f'{o["delivery_days"]} days. "{o["message"]}"'
        for who, o in history
    )


def seller_system(s) -> str:
    return (
        f"You are a seller agent. Personality: {s['personality']}. "
        f"List price ${s['list_price']}. Your secret floor is ${s['floor']}: never go below it "
        f"and never reveal it. Concede gradually, not all at once. "
        f"Your preferred deposit is {s.get('deposit_percent', 30)}% but you may flex a little. "
        f"You can deliver in {s['delivery_days']} days. Keep messages under 25 words. "
        f"Actions: counter, accept (the buyer's last offer), walk_away."
    )


def buyer_system(m) -> str:
    return (
        f"You are a buyer agent purchasing {m['item']}. Your hard budget cap is ${m['budget']} "
        f"and your target price is ${m['target']}. Do not accept above the target until the final "
        f"rounds. You need delivery within {m['max_delivery_days']} days. Never reveal the cap or "
        f"target. Push for a smaller deposit. Only mention a competing price if one is given to "
        f"you in the prompt, and use that exact number. Keep messages under 25 words. "
        f"Actions: counter, accept (the seller's last offer), walk_away."
    )


def negotiate(seller, mandate, max_rounds=6):
    last_seller = {
        "action": "counter",
        "price": seller["list_price"],
        "deposit_percent": 50,
        "delivery_days": seller["delivery_days"],
        "message": f"Welcome! {mandate['item']} is ${seller['list_price']}.",
    }
    history = [("seller", last_seller)]
    print(render(history))

    for _ in range(max_rounds):
        # ---- buyer turn
        b = ask(buyer_system(mandate), "Conversation so far:\n" + render(history) + "\nYour move.")
        if b["action"] == "walk_away":
            print("BUYER walked away.")
            return None
        if b["action"] == "accept":
            ok = (last_seller["price"] <= mandate["budget"]
                  and last_seller["delivery_days"] <= mandate["max_delivery_days"])
            if ok:
                print(f'DEAL at ${last_seller["price"]}')
                return last_seller
            # guard: illegal accept becomes a counter at the cap
            b["action"] = "counter"
            b["price"] = mandate["budget"]
        b["price"] = round(min(b["price"], mandate["budget"], last_seller["price"]), 2)
        history.append(("buyer", b))
        print(render(history[-1:]))

        # ---- seller turn
        s = ask(seller_system(seller), "Conversation so far:\n" + render(history) + "\nYour move.")
        if s["action"] == "walk_away":
            print("SELLER walked away.")
            return None
        if s["action"] == "accept":
            if b["price"] >= seller["floor"]:
                print(f'DEAL at ${b["price"]}')
                return {**b, "delivery_days": last_seller["delivery_days"]}
            # guard: illegal accept becomes a counter at the floor
            s["action"] = "counter"
            s["price"] = seller["floor"]
        s["price"] = round(max(s["price"], seller["floor"]), 2)
        s["price"] = min(s["price"], last_seller["price"])
        last_seller = s
        history.append(("seller", s))
        print(render(history[-1:]))

    print("No deal: out of rounds.")
    return None


if __name__ == "__main__":
    seller = {"personality": "friendly but firm", "list_price": 100, "floor": 80, "delivery_days": 5}
    mandate = {"item": "a 27-inch monitor", "budget": 90, "max_delivery_days": 7}
    print("RESULT:", negotiate(seller, mandate))