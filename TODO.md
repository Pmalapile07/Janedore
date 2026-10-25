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
- **Admin fields:** let brands (or admin) set their slogan, shown in the middle of their hero photo (`vendor.slogan`; nothing shows until it is set), and their (About removed: brand pages show no story, like Superbalist). The line under their name in the brand bar is now automatic: the brand's top two departments ("Clothing & Accessories"), no location.
- **Collections:** brands set up their own collections (name, image, products) for the Collections tiles, which are empty placeholders for now.
- **Layout per category:** a brand page's sections (hero, New from, Collections, slider vs grid, order) should differ by the kind of brand (clothing, accessories, homeware, beauty, kids, men's). Header, brand bar and scroll behaviour stay the same everywhere. Decide each layout and make it choosable in admin.

- **Brand rating:** once brands have reviews, show their average in the brand bar ("Clothing & Accessories · ★ 4.7 (32)"), only when they have some. A full Reviews tab was tried and left out: product pages already show reviews, and empty tabs make new brands look worse.

## Sorting, recommendations and search
- **Sold out last:** push sold-out products to the end of every collection grid and home page row, instead of mixed in with what's available.
- **Suggested products bug:** `getSuggestedProducts()` (`collection.js`) puts the same brand first, then featured products, but passing the list through `merchandiseProducts()` re-sorts it by category and price, so that order is lost.
- **Better "You may also like":** same department and gender, a similar price range, the same brand first, in stock only (now: same category, cheapest first).
- **Better search:** rank exact name matches first, also match colours and descriptions, and tolerate small typos like "dres" (now: plain matching on name, brand and category slug, unranked; `search.js` `getSearchResults()`).
- **Best sellers:** count units sold per product at checkout (`soldCount`, nothing records it yet), then add a Best selling sort and Trending rows.

## Product codes
- **SKU per colour and size:** a code for each exact item (e.g. `NOIR-COAT-BLK-M`), set in the admin product form beside each colour's stock per size, so brands pick the right item. Show it on packing slips, brand order emails and in admin orders. Products have one product-level SKU today.
- **Barcode field (optional):** let brands that already have barcodes (GTIN/EAN) enter them per colour and size, for Google Shopping later (products without one are marked "no barcode"). No scanners: brands ship their own stock.
- **JANEDORE's own products:** if they're ever sold on Takealot or in shops, get official barcodes from GS1 South Africa first.

## Wallet and store credit
- **Store credit:** a balance per customer with a history of every credit and spend (server only), shown in Account > Wallet (now a "coming soon" placeholder, `account.js` `renderAccountWallet()`).
- **Granting credit:** in admin, refund a return as store credit (only if the customer chooses it; refunds to the original payment method stay the default) and add goodwill credit to a customer.
- **Spending it:** "Use wallet balance" at checkout, taken off the total on the server; skip PayFast when credit covers the whole order.
- **Gift cards (later):** buy a card, a code is emailed, redeeming it adds credit. Prepaid vouchers must stay valid for at least 3 years (Consumer Protection Act).

## Checks
- **Waitlist emails:** the back-in-stock check runs every 15 minutes inside the server (`waitlist-api.js` `sweepWaitlist()`). Make sure the hosting never puts the server to sleep, or move the check to a scheduled job.
- **Deleted accounts:** orders, returns and exchanges from deleted accounts are kept, hidden (`accountDeletedAt`, `account-api.js`). Once the legal period is over (about 5 years for tax), anonymise or delete them automatically, and say how long records are kept in the Privacy & POPIA page.
- **Policies:** update the returns policy page and FAQ in admin to 14 days, and add any return conditions (unworn, tags on, hygiene exclusions) to the returns summary.

## Coming soon page
- **Redesign:** the current page (janedore-coming-soon.html) isn't right yet. Liked so far: the hero photo, the app-preview phones, the dark pop-ups, the shop's black header. Start the next version from what the page needs to say (who it's for, why join), not from another brand's layout.
