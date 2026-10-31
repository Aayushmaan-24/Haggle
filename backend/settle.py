from market import run
from paypal_service import create_order, authorize, capture

SELLER_EMAILS = {
    "Firm Co": "sb-w3zut49686881@business.example.com",
    "Flex Ltd": "sb-tz0es49686880@business.example.com",
    "Premium Hub": "sb-oxcdq49686734@business.example.com",
}


def main():
    deal = run()
    if not deal:
        return
    total = round(float(deal["price"]), 2)
    deposit = round(total * float(deal["deposit_percent"]) / 100, 2)
    balance = round(total - deposit, 2)
    email = SELLER_EMAILS[deal["seller"]]

    print(f'\nSettling with {deal["seller"]}: total ${total:.2f} = deposit ${deposit:.2f} + balance ${balance:.2f}')
    o = create_order(f"{total:.2f}", email)
    print("Open in incognito and approve as the US Personal account:")
    print(o["approve_url"])
    input("Press Enter after approving...")

    auth_id = authorize(o["order_id"])
    print("Funds held. Authorization:", auth_id)

    dep = capture(auth_id, f"{deposit:.2f}", final=False)
    print("Deposit captured:", dep["status"])

    input("Press Enter to confirm delivery and release the balance...")
    if balance > 0:
        bal = capture(auth_id, f"{balance:.2f}", final=True)
        print("Balance captured:", bal["status"])
    print("Done.")


if __name__ == "__main__":
    main()