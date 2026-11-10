"""Product catalog: default budget, target and per-seller prices.
Seller names must match market.SELLERS."""


def _p(pid, name, item, budget, target, firm, flex, premium):
    return {
        "id": pid, "name": name, "item": item, "budget": budget, "target": target,
        "prices": {
            "Firm Co": {"list": firm[0], "floor": firm[1]},
            "Flex Ltd": {"list": flex[0], "floor": flex[1]},
            "Premium Hub": {"list": premium[0], "floor": premium[1]},
        },
    }


PRODUCTS = [
    _p("monitor", "27-inch monitor", "a 27-inch monitor", 90, 85, (105, 85), (98, 76), (118, 88)),
    _p("headphones", "Wireless headphones", "a pair of wireless headphones", 138, 130, (160, 130), (150, 116), (180, 135)),
    _p("keyboard", "Mechanical keyboard", "a mechanical keyboard", 110, 104, (128, 104), (120, 93), (144, 108)),
    _p("desk", "Standing desk", "a standing desk", 370, 345, (430, 345), (400, 310), (480, 360)),
    _p("chair", "Ergonomic office chair", "an ergonomic office chair", 230, 215, (270, 215), (250, 195), (300, 225)),
    _p("smartwatch", "Smartwatch", "a smartwatch", 185, 172, (215, 175), (200, 155), (240, 180)),
    _p("espresso", "Espresso machine", "an espresso machine", 275, 260, (320, 260), (300, 235), (360, 270)),
    _p("laptop", "14-inch laptop", "a 14-inch laptop", 830, 780, (960, 780), (900, 700), (1080, 810)),
    _p("shoes", "Running shoes", "a pair of running shoes", 101, 95, (118, 95), (110, 85), (132, 99)),
    _p("vacuum", "Robot vacuum", "a robot vacuum", 320, 300, (375, 305), (350, 270), (420, 315)),
]

for _x in PRODUCTS:
    assert 0 < _x["target"] <= _x["budget"], _x["id"]
    for _s in _x["prices"].values():
        assert 0 < _s["floor"] <= _s["list"], _x["id"]
