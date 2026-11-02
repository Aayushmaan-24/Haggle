import json
import os
import sys

import market

events = []
winner = market.run(emit=events.append)
if not winner:
    sys.exit("No deal this run. Run it again.")
os.makedirs("../data", exist_ok=True)
with open("../data/replay.json", "w") as f:
    json.dump(events, f)
print("saved", len(events), "events; winner", winner["seller"], winner["price"])