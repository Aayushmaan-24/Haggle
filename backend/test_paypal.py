from paypal_service import create_order, authorize, capture

SELLER = "sb-w3zut49686881@business.example.com"

o = create_order("42.50", SELLER)
print("Open in incognito and approve as the US Personal account:")
print(o["approve_url"])
input("Press Enter after approving...")
auth_id = authorize(o["order_id"])
print("authorization:", auth_id)
print("capture status:", capture(auth_id)["status"])