from concurrent.futures import ThreadPoolExecutor
from negotiate import ask, render, seller_system, buyer_system
import re

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


def new_state(s):
    opening = {"action": "counter", "price": s["list_price"], "deposit_percent": 50,
               "delivery_days": s["delivery_days"],
               "message": f"Welcome! {MANDATE['item']} is ${s['list_price']}."}
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


def show(st, who, o):
    print(f'[{st["name"]}] {who}: ${o["price"]}, {o["deposit_percent"]}% dep, '
          f'{o["delivery_days"]}d - "{o["message"]}"')

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

def run(sellers=SELLERS, mandate=MANDATE, max_rounds=5):
    states = [new_state(s) for s in sellers]
    for st in states:
        if st["seller"]["delivery_days"] > mandate["max_delivery_days"]:
            st["status"] = "out"
            print(f'[{st["name"]}] disqualified: cannot meet deadline')

    with ThreadPoolExecutor(max_workers=len(states)) as pool:
        for rnd in range(1, max_rounds + 1):
            active = [st for st in states if st["status"] == "active"]
            if not active:
                break
            print(f"\n=== ROUND {rnd} ===")

            # --- buyer moves (parallel), each with the best rival price
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
                    print(f'[{st["name"]}] buyer walked away')
                    continue
                if b["action"] == "accept":
                    if st["last"]["price"] <= mandate["budget"] and (st["last"]["price"] <= mandate["target"] or rnd >= max_rounds - 1):
                        st["status"], st["deal"] = "deal", st["last"]
                        print(f'[{st["name"]}] DEAL at ${st["deal"]["price"]}')
                        continue
                    b["action"], b["price"] = "counter", mandate["budget"]  # guard
                b = clean_message(b, rivals[st["name"]])
                st["history"].append(("buyer", b))
                show(st, "BUYER", b)
                responders.append(st)

            # --- seller moves (parallel)
            replies = list(pool.map(seller_turn, responders))
            for st, s in zip(responders, replies):
                b = st["history"][-1][1]
                floor = st["seller"]["floor"]
                if s["action"] == "walk_away":
                    st["status"] = "out"
                    print(f'[{st["name"]}] seller walked away')
                    continue
                if s["action"] == "accept":
                    if b["price"] >= floor:
                        st["status"] = "deal"
                        st["deal"] = {**b, "delivery_days": st["last"]["delivery_days"]}
                        print(f'[{st["name"]}] DEAL at ${st["deal"]["price"]}')
                        continue
                    s["action"], s["price"] = "counter", floor  # guard
                s["price"] = round(min(max(s["price"], floor), st["last"]["price"]), 2)
                s["delivery_days"] = st["seller"]["delivery_days"]  # guard
                st["last"] = s
                st["history"].append(("seller", s))
                show(st, "SELLER", s)

    # Best-and-final: still-active sellers whose last offer fits the mandate
    for st in states:
        if st["status"] == "active" and st["last"]["price"] <= mandate["budget"]:
            st["status"], st["deal"] = "deal", st["last"]
            print(f'[{st["name"]}] closed at final offer ${st["deal"]["price"]}')

    deals = sorted((st for st in states if st["deal"]), key=lambda st: score(st["deal"]))
    print("\n=== RESULTS (lower score is better) ===")
    for st in deals:
        d = st["deal"]
        print(f'{st["name"]}: ${d["price"]}, {d["deposit_percent"]}% dep, '
              f'{d["delivery_days"]}d, score {score(d)}')
    if not deals:
        print("No deal inside the mandate.")
        return None
    winner = deals[0]
    print(f'\nWINNER: {winner["name"]} at ${winner["deal"]["price"]}')
    return {"seller": winner["name"], **winner["deal"]}


if __name__ == "__main__":
    run()