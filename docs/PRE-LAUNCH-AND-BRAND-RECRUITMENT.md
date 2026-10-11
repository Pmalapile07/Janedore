# JANEDORE — Pre-Launch & Brand Recruitment Checklist

**Purpose:** Launch JANEDORE's presence first, build trust and an audience, and recruit/curate brands. The full shopping marketplace launch happens later, after the first collective is selected, onboarded, and tested.

**Important:** This is an operating checklist, not a claim that any item is already complete. Mark items only after verifying them on the live site or in the admin.

## The rollout

1. **Phase 1 — Public pre-launch:** Explain JANEDORE, collect interest from customers and brands, and begin direct brand outreach. The site is a curated introduction and application funnel, not a promise that the full catalogue is already open.
2. **Phase 2 — Curate the first collective:** Review brand applications, contact selected brands, agree expectations, and help promising brands become launch-ready.
3. **Phase 3 — Onboard and test:** Gather approved product information and imagery, build listings, agree fulfilment/returns responsibilities, and test the whole order journey.
4. **Phase 4 — Full marketplace launch:** Open shopping once the launch gate below is satisfied. Do not set a date just to meet a calendar if readiness is not there.

---

## Phase 1 — Pre-launch presence

### Positioning and public message
- [ ] Clearly describe JANEDORE as a **curated, multi-brand fashion house / independent collective**—not only a sunglasses shop.
- [ ] Explain the value to shoppers: discover considered products from independent and under-the-radar brands.
- [ ] Explain the value to brands: curated visibility, clear standards, feedback, and support where appropriate.
- [ ] Use the same spelling, positioning, tone, and visual identity across the website and social profiles.
- [ ] State plainly that the full marketplace is coming later; do not imply a full catalogue is already available.
- [ ] Review the coming-soon page on a phone, including typography, image crop, links, and loading behaviour.

### Two distinct calls to action
- [ ] Customer CTA: **Get launch updates / Join the list**.
- [ ] Brand CTA: **Apply to be considered / Join the collective**.
- [ ] Confirm both forms submit successfully on mobile.
- [ ] Confirm submissions are stored somewhere the team can actually review.
- [ ] Confirm a success message appears and errors are understandable.
- [ ] Capture consent for marketing messages where required and link to a clear privacy notice.
- [ ] Record how each lead found JANEDORE, if practical.

### Trust and contact
- [ ] Publish a working contact/support method.
- [ ] Publish an appropriate privacy notice explaining lead-data use and retention.
- [ ] Check footer links and social links; remove placeholders and broken destinations.
- [ ] Check page title, meta description, share preview, favicon, and spelling.
- [ ] Confirm the coming-soon page is the intended public entry point while the full storefront is not yet ready.
- [ ] Check whether search engines should index the coming-soon page; avoid accidentally exposing unfinished shopping pages in search.

### Pre-launch technical smoke test
- [ ] Test the public page on iPhone-sized mobile and desktop.
- [ ] Test every CTA, form, navigation link, and footer link.
- [ ] Check for console errors and failed network requests.
- [ ] Confirm no private customer, vendor, admin, or order information is visible publicly.
- [ ] Review Firebase/Firestore rules and server endpoints before inviting real users.
- [ ] Verify admin login and role restrictions.
- [ ] Confirm lead data can be exported/retrieved and has a named person responsible for responding.
- [ ] Make a backup/known-good commit before release.

**Phase 1 exit gate:** A visitor understands what JANEDORE is, customers can request updates, brands can apply, submissions are retrievable, and contact/privacy information is present.

---

## Phase 2 — Brand discovery and curation

### Build the pipeline
- [ ] Create a shortlist of suitable South African independent brands across relevant categories (fashion, accessories, jewellery, scent, skincare, and lifestyle).
- [ ] Track each prospect: brand, category, contact, social/site, date contacted, response, next action, status, and notes.
- [ ] Use statuses consistently: Discovered → Contacted → Interested → Reviewing → Selected → Agreement pending → Onboarding → Ready → Live / Not now.
- [ ] Contact brands personally; explain why their work fits JANEDORE rather than sending generic mass messages.
- [ ] Track follow-ups and avoid repeated messages after a clear refusal.
- [ ] Set a weekly outreach and follow-up target that is realistic to maintain.

### Curation standards
- [ ] Define what makes a brand a fit: product quality, distinct point of view, reliability, pricing, customer experience, and alignment with JANEDORE's aesthetic.
- [ ] Define minimum product/photo/packaging standards without excluding promising brands who can realistically improve.
- [ ] Create a constructive feedback path for brands that have potential but are not launch-ready.
- [ ] Be explicit about whether selection is not a guarantee of sales or promotion.
- [ ] Avoid promising reach, revenue, or placement outcomes that cannot be guaranteed.

### Brand conversations
- [ ] Learn the brand's story, hero products, customer, pricing, stock capacity, lead times, and current sales channels.
- [ ] Confirm product authenticity, ownership/permission to use images and brand assets, and product claims where relevant.
- [ ] Discuss fulfilment, shipping cost, delivery estimates, tracking, returns, refunds, damaged items, and customer support.
- [ ] Explain the commercial model clearly: commission/fees, payment timing, who handles customer service, and who owns inventory. Do not onboard until terms are agreed in writing.
- [ ] Record the decision and next step after every call or conversation.

**Phase 2 exit gate:** The first collective is intentionally selected, each selected brand understands the terms, and there is a realistic path to making its products ready.

---

## Phase 3 — Vendor onboarding and catalogue readiness

For **each selected brand**:
- [ ] Written vendor/brand agreement completed.
- [ ] Legal business/contact and payout details collected securely where needed.
- [ ] Vendor responsibilities and JANEDORE responsibilities documented.
- [ ] Product list, variants, sizes, materials, care instructions, prices, stock levels, and SKU/reference details confirmed.
- [ ] Product descriptions and claims reviewed.
- [ ] Images meet the agreed editorial standards and the brand has granted usage permission.
- [ ] Product listings reviewed on mobile for image crop, layout, price, variants, and stock state.
- [ ] Shipping, dispatch time, packaging, returns, refunds, and damaged/missing parcel process agreed.
- [ ] Vendor knows how to communicate stock changes and order issues.
- [ ] Brand has approved its final presentation/listings.
- [ ] One named contact and response expectations are recorded.

### Marketplace operations
- [ ] Test a complete order from product page through cart, checkout, payment, confirmation, admin order view, and customer notification.
- [ ] Test failed/cancelled payment and ensure the customer is not falsely shown as paid.
- [ ] Test stock/availability changes and duplicate-submit behaviour.
- [ ] Verify PayFast live configuration and server-side payment notification verification before accepting real payments.
- [ ] Verify order confirmation, dispatch, delivery, cancellation, and refund communication.
- [ ] Confirm who fulfils each order and how tracking reaches the customer.
- [ ] Test customer support/chat handoff and make sure a human can respond to escalations.
- [ ] Verify policies: terms, privacy/POPIA handling, shipping, returns/refunds, cancellations, and complaints.
- [ ] Confirm backups, error monitoring, access control, and a rollback path.
- [ ] Run test orders with the selected brands and document results.

**Phase 3 exit gate:** Every launch brand has approved listings and agreed operations; critical customer journeys pass end-to-end tests; no unresolved launch-blocking payment, security, or fulfilment issues remain.

---

## Phase 4 — Full marketplace launch decision

Only proceed when the following are true:
- [ ] The first collective contains enough genuinely ready brands and products to make the customer experience feel intentional.
- [ ] All launch brands have signed terms and approved listings.
- [ ] Pricing, stock, fulfilment, shipping, returns, refunds, and support ownership are clear.
- [ ] Payment and order flows have passed live-configuration checks and end-to-end tests.
- [ ] Mobile storefront, cart, checkout, order confirmation, and support have been checked.
- [ ] Public policies and contact details are published and accurate.
- [ ] Brand and customer launch communications are prepared.
- [ ] Someone is available to handle customer and vendor issues on launch day.
- [ ] A go/no-go review has been completed; unresolved critical issues mean **no-go**.

## First 30 days after public pre-launch

- [ ] Review brand applications and customer sign-ups at least weekly.
- [ ] Respond to interested brands and customers within the stated response window.
- [ ] Track: brand prospects contacted, response rate, applications, qualified brands, brands onboarded, customer sign-ups, and source of sign-ups.
- [ ] Ask a small number of brands and potential customers for feedback; record recurring objections.
- [ ] Publish progress and behind-the-scenes curation content without announcing brands before they approve it.
- [ ] Review the checklist weekly and assign a next action to every open item.

## Decision log / details to fill in

- Public pre-launch date: **Not set**
- Target full marketplace launch: **Not set; depends on brand readiness**
- Customer mailing-list destination: **Verify in repo/live site**
- Brand application destination: **Verify in repo/live site**
- Support contact: **Verify before publishing**
- Initial number of launch-ready brands/products: **Set after curation; do not guess**
- Marketplace commercial terms: **Must be agreed and documented before onboarding**
