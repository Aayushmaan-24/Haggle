import json
import os
import random
import sys
import time

import market


def scenario(i: int, rng: random.Random):
    scale = rng.choice([0.5, 1, 2, 5, 10])
    sellers = []
    for s in market.SELLERS:
        sellers.append({**s,
                        "list_price": round(s["list_price"] * scale * rng.uniform(0.95, 1.08), 2),
                        "floor": round(s["floor"] * scale * rng.uniform(0.95, 1.05), 2)})
    avg_list = sum(s["list_price"] for s in sellers) / len(sellers)
    budget = round(avg_list * rng.choice([0.85, 0.9, 0.95]), 2)
    target = round(budget * 0.94, 2)
    mandate = {**market.MANDATE, "item": f"item #{i + 1}", "budget": budget, "target": target}
    return sellers, mandate


def main(n: int):
    rng = random.Random(42)  # fixed seed: the benchmark is reproducible
    rows, violations = [], 0
    for i in range(n):
        sellers, mandate = scenario(i, rng)
        print(f"[{i + 1}/{n}] budget ${mandate['budget']}, target ${mandate['target']}", flush=True)
        try:
            w = market.run(sellers=sellers, mandate=mandate, emit=lambda e: None)
        except Exception as ex:
            print("   run failed:", str(ex)[:100])
            continue
        row = {"budget": mandate["budget"], "target": mandate["target"], "deal": bool(w)}
        if w:
            s = next(x for x in sellers if x["name"] == w["seller"])
            cheapest_list = min(x["list_price"] for x in sellers)
            ok = (w["price"] <= mandate["budget"] and w["price"] >= s["floor"]
                  and w["delivery_days"] <= mandate["max_delivery_days"])
            violations += 0 if ok else 1
            row.update(seller=w["seller"], price=w["price"], list_price=s["list_price"],
                       saving_vs_list=round((s["list_price"] - w["price"]) / s["list_price"] * 100, 1),
                       saving_vs_cheapest=round((cheapest_list - w["price"]) / cheapest_list * 100, 1),
                       guard_ok=ok)
            print(f"   winner {w['seller']} at ${w['price']} ({row['saving_vs_list']}% off list)")
        else:
            print("   no deal")
        rows.append(row)
        time.sleep(5)  # stay under free-tier rate limits

    done = [r for r in rows if r["deal"]]
    summary = {
        "runs": len(rows),
        "deal_rate_pct": round(len(done) / len(rows) * 100, 1) if rows else 0,
        "avg_saving_vs_list_pct": round(sum(r["saving_vs_list"] for r in done) / len(done), 1) if done else 0,
        "avg_saving_vs_cheapest_list_pct": round(sum(r["saving_vs_cheapest"] for r in done) / len(done), 1) if done else 0,
        "guard_violations": violations,
    }
    print("\nSUMMARY", json.dumps(summary, indent=2))
    os.makedirs("../data", exist_ok=True)
    with open("../data/benchmark.json", "w") as f:
        json.dump({"summary": summary, "runs": rows}, f, indent=2)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 10)