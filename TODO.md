# Janedore — to do next

## Bob Go integration
- **Shipping methods:** replace the single "Standard" R150 option at checkout with Bob Go's shipping methods and rates (`checkout.html` shipping card, `cart.js` `getCartShipments()`, `server.js` `priceOrder()`).
- **Delivery estimate:** replace the placeholder 3–6 business-day estimate (`checkout.js` `DELIVERY_DAYS_MIN` / `DELIVERY_DAYS_MAX`, `deliveryEstimateText()`) with Bob Go's estimate.
- **Courier tracking:** let Bob Go provide the courier and tracking link instead of the hand-written `COURIER_TRACKING_URLS` list in `track-order.js` and `order-emails.js`. Until then, check each of those links with a real tracking number (only DHL is known to fill the number in).
- **Shared warehouses:** check that brands sharing a warehouse (Admin > Brands > Warehouse) are booked as one Bob Go shipment.

## Checkout
- **Payment icons:** swap `payment-visa.svg`, `payment-mastercard.svg`, `payment-instant-eft.svg` and `payment-apple-pay.svg` for the new icon set (zip to follow).
