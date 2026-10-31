import re
from concurrent.futures import ThreadPoolExecutor
from negotiate import ask, render, seller_system, buyer_system

SELLERS = [
    {"name": "Firm Co", "personality": "firm, reluctant to discount, values deposits",
     "list_price": 105, "floor": 85, "delivery_days": 4},
    {"name": "Flex Ltd", "personality": "flexible, wants volume, but slow shipping",
     "list_price": 98, "floor": 76, "delivery_days": 6},
    {"name": "Premium Hub", "personality": "premium brand, fast delivery, rarely discounts",
     "list_price": 118, "floor": 88, "delivery_days": 2},
]
MANDATE = {"item": "a 27-inch monitor", "budget": 90, "target": 85, "max_delivery_days": 7}

# Visible scoring weights (lower score is better)
W_DEPOSIT, W_DELIVERY = 0.05, 0.5


def score(o):
    return round(o["price"] * (1 + W_DEPOSIT * o["deposit_percent"] / 100)
                 + W_DELIVERY * o["delivery_days"], 2)


def cli_emit(e):
    t = e["type"]
    if t == "round":
        print("\n=== OPENING ===" if e["n"] == 0 else f'\n=== ROUND {e["n"]} ===')
    elif t == "offer":
        print(f'[{e["seller"]}] {e["who"].upper()}: ${e["price"]}, {e["deposit_percent"]}% dep, '
              f'{e["delivery_days"]}d - "{e["message"]}"')
    elif t == "status":
        print(f'[{e["seller"]}] {e["status"].upper()}: {e["note"]}')
    elif t == "result":
        print("\n=== RESULTS (lower score is better) ===")
        for r in e["ranking"]:
            print(f'{r["seller"]}: ${r["price"]}, {r["deposit_percent"]}% dep, '
                  f'{r["delivery_days"]}d, score {r["score"]}')
        print("\nWINNER:", e["winner"]["seller"] if e["winner"] else "none")


def new_state(s, mandate):
    opening = {"action": "counter", "price": s["list_price"], "deposit_percent": 50,
               "delivery_days": s["delivery_days"],
               "message": f"Welcome! {mandate['item']} is ${s['list_price']}."}
    return {"seller": s, "name": s["name"], "history": [("seller", opening)],
            "last": opening, "status": "active", "deal": None}


def cur_price(st):
    return st["deal"]["price"] if st["deal"] else st["last"]["price"]


def buyer_turn(st, mandate, rival):
    prompt = "Conversation so far:\n" + render(st["history"])
    if rival is not None:
        prompt += (f"\nAnother seller currently offers ${rival}. You may mention a "
                   f"competing offer but never name the seller.")
    return ask(buyer_system(mandate), prompt + "\nYour move.")


def seller_turn(st):
    return ask(seller_system(st["seller"]),
               "Conversation so far:\n" + render(st["history"]) + "\nYour move.")


def clean_message(b, rival):
    allowed = {round(b["price"])}
    if rival is not None:
        allowed.add(round(rival))
    nums = {round(float(x)) for x in re.findall(r"\$(\d+(?:\.\d+)?)", b["message"])}
    if nums - allowed:  # message cites a number that is not real
        text = f'I can do ${b["price"]:.0f} with a {b["deposit_percent"]:.0f}% deposit.'
        if rival is not None:
            text += f' Another seller is at ${rival:.0f}.'
        b["message"] = text
    return b


def run(sellers=SELLERS, mandate=MANDATE, max_rounds=5, emit=cli_emit):
    def offer(st, who, o):
        emit({"type": "offer", "seller": st["name"], "who": who,
              "price": o["price"], "deposit_percent": o["deposit_percent"],
              "delivery_days": o["delivery_days"], "message": o["message"]})

    def status(st, s, note, price=None):
        emit({"type": "status", "seller": st["name"], "status": s, "note": note, "price": price})

    states = [new_state(s, mandate) for s in sellers]
    emit({"type": "round", "n": 0})
    for st in states:
        offer(st, "seller", st["last"])
        if st["seller"]["delivery_days"] > mandate["max_delivery_days"]:
            st["status"] = "out"
            status(st, "out", "cannot meet the delivery deadline")

    with ThreadPoolExecutor(max_workers=len(states)) as pool:
        for rnd in range(1, max_rounds + 1):
            active = [st for st in states if st["status"] == "active"]
            if not active:
                break
            emit({"type": "round", "n": rnd})

            rivals = {}
            for st in active:
                others = [cur_price(o) for o in states
                          if o is not st and o["status"] in ("active", "deal")]
                rivals[st["name"]] = min(others) if others else None
            moves = list(pool.map(lambda st: buyer_turn(st, mandate, rivals[st["name"]]), active))

            responders = []
            for st, b in zip(active, moves):
                if b["action"] == "walk_away":
                    st["status"] = "out"
                    status(st, "out", "buyer walked away")
                    continue
                if b["action"] == "accept":
                    if st["last"]["price"] <= mandate["budget"] and (
                            st["last"]["price"] <= mandate["target"] or rnd >= max_rounds - 1):
                        st["status"], st["deal"] = "deal", st["last"]
                        status(st, "deal", f'deal at ${st["deal"]["price"]}', st["deal"]["price"])
                        continue
                    b["action"], b["price"] = "counter", mandate["target"]  # guard
                b["price"] = round(min(b["price"], mandate["budget"], st["last"]["price"]), 2)
                b = clean_message(b, rivals[st["name"]])
                st["history"].append(("buyer", b))
                offer(st, "buyer", b)
                responders.append(st)

            replies = list(pool.map(seller_turn, responders))
            for st, s in zip(responders, replies):
                b = st["history"][-1][1]
                floor = st["seller"]["floor"]
                if s["action"] == "walk_away":
                    st["status"] = "out"
                    status(st, "out", "seller walked away")
                    continue
                if s["action"] == "accept":
                    if b["price"] >= floor:
                        st["status"] = "deal"
                        st["deal"] = {**b, "delivery_days": st["last"]["delivery_days"]}
                        status(st, "deal", f'deal at ${st["deal"]["price"]}', st["deal"]["price"])
                        continue
                    s["action"], s["price"] = "counter", floor  # guard
                s["price"] = round(min(max(s["price"], floor), st["last"]["price"]), 2)
                s["delivery_days"] = st["seller"]["delivery_days"]  # guard
                st["last"] = s
                st["history"].append(("seller", s))
                offer(st, "seller", s)

    for st in states:
        if st["status"] == "active" and st["last"]["price"] <= mandate["budget"]:
            st["status"], st["deal"] = "deal", st["last"]
            status(st, "deal", f'closed at final offer ${st["deal"]["price"]}', st["deal"]["price"])

    deals = sorted((st for st in states if st["deal"]), key=lambda st: score(st["deal"]))
    ranking = [{"seller": st["name"], "price": st["deal"]["price"],
                "deposit_percent": st["deal"]["deposit_percent"],
                "delivery_days": st["deal"]["delivery_days"],
                "score": score(st["deal"])} for st in deals]
    winner = ranking[0] if ranking else None
    emit({"type": "result", "ranking": ranking, "winner": winner,
          "list_price": winner and next(s["list_price"] for s in sellers if s["name"] == winner["seller"])})
    return winner


if __name__ == "__main__":
    run()