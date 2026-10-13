function buildFooter(id) {
  const el = document.getElementById(id);
  if (!el) return;

  // Keep the existing footer presentation; this changes only its information
  // architecture and makes the links use existing storefront destinations.
  const sections = [
    {
      id: "shop",
      title: "Shop",
      links: [
        { label: "New Arrivals", action: "navigateTo('products')" },
        { label: "All Products", action: "navigateTo('products')" },
        { label: "Sale", action: "navigateToSale()" }
      ]
    },
    {
      id: "brands",
      title: "Brands",
      links: [
        { label: "Discover All Brands", action: "navigateTo('brands')" }
      ]
    },
    {
      id: "the-house",
      title: "The House",
      links: [
        { label: "About JANEDORE", slug: "about" },
        { label: "Brand Partnerships", slug: "contact" }
      ]
    },
    {
      id: "client-services",
      title: "Client Services",
      links: [
        { label: "Frequently Asked Questions", slug: "faq" },
        { label: "Delivery & Collection", slug: "shipping-policy" },
        { label: "Returns & Refunds", slug: "return-policy" },
        { label: "Client Support", slug: "contact" }
      ]
    },
    {
      id: "legal-governance",
      title: "Legal & Governance",
      links: [
        { label: "Terms of Use", slug: "terms-conditions" },
        { label: "Privacy & POPIA", slug: "privacy-policy" }
      ]
    }
  ];

  const collapseHTML = sections.map(section => {
    const sectionId = section.id.replace(/[^a-z0-9-]/gi, "");
    return `
      <div class="footer-collapse" id="footer-collapse-${sectionId}-${id}">
        <div
          class="footer-collapse-header"
          onclick="toggleFooterCollapse('${sectionId}-${id}')"
        >
          ${section.title}

          <svg viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>

        <div class="footer-collapse-body">
          <ul class="footer-links">
            ${section.links.map(link => `
              <li>
                <a${link.action ? ` onclick="${link.action}"` : ` onclick="navigateToContentPage('${link.slug}')"`}>${link.label}</a>
              </li>
            `).join("")}
          </ul>
        </div>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="footer-top">
      ${collapseHTML}
    </div>

    <div class="footer-bottom">
      <div class="footer-copy">
        © 2026 JANEDORE. ALL RIGHTS RESERVED.
      </div>
    </div>
  `;
}


function toggleFooterCollapse(id) {
  document
    .getElementById(`footer-collapse-${id}`)
    ?.classList.toggle("open");
}
