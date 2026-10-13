function buildFooter(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const sections = [
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
                <a onclick="navigateToContentPage('${link.slug}')">${link.label}</a>
              </li>
            `).join("")}
          </ul>
        </div>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="footer-menu-divider" aria-hidden="true"></div>

    <nav class="footer-quick-links" aria-label="Quick links">
      <a href="/pages/track-your-order"><i class="ph ph-truck" aria-hidden="true"></i><span>Track Your Order</span></a>
      <a href="/pages/log-a-return"><i class="ph ph-arrow-u-down-left" aria-hidden="true"></i><span>Log a Return</span></a>
      <a href="/pages/become-a-brand"><i class="ph ph-house-line" aria-hidden="true"></i><span>Become a Brand</span></a>
    </nav>

    <div class="footer-top">
      ${collapseHTML}
    </div>

    <div class="footer-brand-divider" aria-hidden="true"></div>

    <div class="footer-brand-mark" aria-label="JANEDORE">
      <span class="footer-logo-fallback">JANEDORE</span>
    </div>

    <div class="footer-socials" aria-label="Social media">
      <i class="ph-fill ph-facebook-logo" aria-label="Facebook" role="img"></i>
      <i class="ph-bold ph-instagram-logo" aria-label="Instagram" role="img"></i>
      <i class="ph-bold ph-tiktok-logo" aria-label="TikTok" role="img"></i>
    </div>

    <div class="footer-bottom">
      <p class="footer-legal-line"><span class="footer-copy">© 2026 Janedore. All rights reserved.</span> <span class="footer-disclaimer">Independent brands featured on this platform remain the property of their respective owners.</span></p>
    </div>
  `;

  const headerLogo = document.querySelector(".nav-logo");
  const footerLogoMark = el.querySelector(".footer-brand-mark");
  const headerLogoText = headerLogo?.querySelector(".nav-logo-text");
  if (footerLogoMark && headerLogoText) {
    const logoText = headerLogoText.cloneNode(true);
    logoText.removeAttribute("id");
    logoText.style.color = "#fff";
    const computed = window.getComputedStyle(headerLogoText);
    logoText.style.fontSize = computed.fontSize;
    logoText.style.fontFamily = computed.fontFamily;
    logoText.style.fontWeight = computed.fontWeight;
    logoText.style.letterSpacing = computed.letterSpacing;
    logoText.style.lineHeight = computed.lineHeight;
    footerLogoMark.replaceChildren(logoText);
  }
}


function toggleFooterCollapse(id) {
  document
    .getElementById(`footer-collapse-${id}`)
    ?.classList.toggle("open");
}
