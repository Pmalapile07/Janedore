function buildFooter(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const sections = ["shop", "brands", "policies", "help"];

  const collapseHTML = sections.map(sec => {
    const links = {
      shop: [
        { label: "New In" },
        { label: "Dresses" },
        { label: "Tops" },
        { label: "Bottoms" },
        { label: "Jackets" },
        { label: "Sets" },
        { label: "Bags" },
        { label: "Jewelry" },
        { label: "Scent" },
        { label: "Sale" }
      ],

      brands: [],

      policies: [
        { label: "About", slug: "about" },
        { label: "Shipping Policy", slug: "shipping-policy" },
        { label: "Return Policy", slug: "return-policy" },
        { label: "Privacy Policy", slug: "privacy-policy" },
        { label: "Terms & Conditions", slug: "terms-conditions" }
      ],

      help: [
        { label: "FAQ", slug: "faq" },
        { label: "Size Guide", slug: "size-guide" },
        { label: "Shipping", slug: "shipping" },
        { label: "Returns", slug: "returns" },
        { label: "Contact", slug: "contact" }
      ]
    }[sec];

    return `
      <div class="footer-collapse" id="footer-collapse-${sec}-${id}">
        <div
          class="footer-collapse-header"
          onclick="toggleFooterCollapse('${sec}-${id}')"
        >
          ${sec.charAt(0).toUpperCase() + sec.slice(1)}

          <svg viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>

        <div class="footer-collapse-body">
          <ul class="footer-links">
            ${links.map(l => `
              <li>
                <a${l.slug ? ` onclick="navigateToContentPage('${l.slug}')"` : ''}>${l.label}</a>
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
        © 2025 JANEDORE. ALL RIGHTS RESERVED.
      </div>
    </div>
  `;
}


function toggleFooterCollapse(id) {
  document
    .getElementById(`footer-collapse-${id}`)
    ?.classList.toggle("open");
}
