# Janedore — to do next

## Bob Go integration
- **Shipping methods:** replace the single "Standard" R150 option at checkout with Bob Go's shipping methods and rates (`checkout.html` shipping card, `cart.js` `getCartShipments()`, `server.js` `priceOrder()`).
- **Delivery estimate:** replace the placeholder 3–6 business-day estimate (`checkout.js` `DELIVERY_DAYS_MIN` / `DELIVERY_DAYS_MAX`, `deliveryEstimateText()`) with Bob Go's estimate.
- **Courier tracking:** let Bob Go provide the courier and tracking link instead of the hand-written `COURIER_TRACKING_URLS` list in `track-order.js` and `order-emails.js`. Until then, check each of those links with a real tracking number (only DHL is known to fill the number in).
- **Shared warehouses:** check that brands sharing a warehouse (Admin > Brands > Warehouse) are booked as one Bob Go shipment.

## Money: delivery fees and Bob Go
- **Who pays what:** the customer's delivery fee comes in through PayFast with the order; Janedore pays Bob Go from a prepaid Bob Go balance. Talk to Bob Go (billing +27 12 940 1060) and PayFast about the details.
- **Cash flow:** PayFast pays out a few days after an order, but Bob Go needs the money in the balance before a courier is booked. Decide how big a float to keep.
- **Courier adjustments:** Bob Go's price is an estimate; if the courier measures a parcel bigger or heavier, the difference is charged afterwards. Decide who covers it (ask brands for accurate weights and sizes).
- **Free delivery over R750:** Janedore pays the courier on those orders. Set the commission so it covers this.

## Brand pages
- **Admin fields:** let brands (or admin) set the hero headline (`vendor.heroHeading`; falls back to the brand name), the line under their name in the brand bar (now "location · main department"), and their short About text (`description`).
- **Collections:** brands set up their own collections (name, image, products) for the Collections tiles, which are empty placeholders for now.
- **Layout per category:** a brand page's sections (hero, New from, Collections, slider vs grid, order) should differ by the kind of brand (clothing, accessories, homeware, beauty, kids, men's). Header, brand bar and scroll behaviour stay the same everywhere. Decide each layout and make it choosable in admin.
