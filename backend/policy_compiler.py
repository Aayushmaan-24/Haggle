from negotiate import ask

POLICY_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "list_price": {"type": "number"},
        "floor_price": {"type": "number"},
        "deposit_percent": {"type": "number"},
        "delivery_days": {"type": "integer"},
        "personality": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": ["name", "list_price", "floor_price", "deposit_percent",
                 "delivery_days", "personality", "notes"],
}

SYSTEM = (
    "You convert a merchant's plain-English pricing rules into a structured seller policy. "
    "name is the shop's name, never the product; if no shop name is given, use 'Your Shop'. "
    "Use only numbers stated or clearly implied by the rules. If the floor is given as a percent "
    "of list price, compute floor_price in dollars. personality is a short phrase describing "
    "negotiating style. If a number is missing, choose a sensible value and say so in notes."
)


def compile_rules(text: str) -> dict:
    p = ask(SYSTEM, text[:2000], POLICY_SCHEMA)
    list_price = max(float(p["list_price"]), 1.0)
    floor = min(max(float(p["floor_price"]), 0.0), list_price)  # floor can never exceed list
    return {
        "name": (p["name"] or "My Shop")[:40],
        "list_price": round(list_price, 2),
        "floor": round(floor, 2),
        "deposit_percent": min(max(float(p["deposit_percent"]), 0.0), 100.0),
        "delivery_days": min(max(int(p["delivery_days"]), 1), 30),
        "personality": p["personality"][:120],
        "notes": p["notes"][:300],
    }