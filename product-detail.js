function buildSizeTable(raw, productCategory) {
  if (!raw) return '';
  
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const isCSV = lines.length > 1 && lines[0].includes(',');
  
  // Determine category-specific configuration
  const categoryConfig = getCategoryConfig(productCategory);
  
  // Handle non-table formats (handbags, pouches, sunglasses, earrings, perfume)
  if (!categoryConfig.isTable) {
    return buildSpecificationList(raw, categoryConfig);
  }
  
  // Handle CSV table formats
  if (!isCSV) {
    return `<p style="white-space:pre-line;font-size:11px;font-weight:300;line-height:2;color:#666;padding:16px 0;">${raw}</p>`;
  }
  
  const rows = lines.map(l => l.split(',').map(c => c.trim()));
  const header = rows[0];
  const body = rows.slice(1);
  
  // Determine unit label
  const unitLabel = categoryConfig.unit || 'CM';
  
  const headerHtml = header.map((h, i) => 
    `<th style="
      padding: 14px 16px;
      text-align: ${i === 0 ? 'left' : 'center'};
      font-weight: 400;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      font-size: 10px;
      color: #333;
      border-bottom: 1px solid #e8e8e8;
      white-space: nowrap;
    ">${h}</th>`
  ).join('');
  
  const bodyHtml = body.map(row => {
    const cells = row.map((cell, ci) => 
      `<td style="
        padding: 16px 16px;
        text-align: ${ci === 0 ? 'left' : 'center'};
        color: #666;
        font-size: 12px;
        font-weight: 300;
        letter-spacing: 0.02em;
        white-space: nowrap;
      ">${cell}</td>`
    ).join('');
    
    return `<tr style="
      border-bottom: 1px solid #e8e8e8;
    ">${cells}</tr>`;
  }).join('');
  
  return `
    <div style="
      position: relative;
      background: #fff;
      font-family: inherit;
    ">
      <div style="
        text-align: right;
        font-size: 9px;
        font-weight: 400;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #999;
        margin-bottom: 8px;
        padding-right: 16px;
      ">${unitLabel}</div>
      <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
        <table style="
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          min-width: 300px;
        ">
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
        </table>
      </div>
      <p style="
        font-size: 10px;
        font-weight: 300;
        color: #999;
        margin-top: 16px;
        line-height: 1.8;
        letter-spacing: 0.03em;
      ">Measurements are provided as a guide. A variance of 1–3cm may occur.</p>
    </div>`;
}

function getCategoryConfig(category) {
  const configs = {
    tops: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    shirts: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    vests: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    dresses: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    bottoms: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    trousers: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    jackets: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    outerwear: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    sets: {
      isTable: true,
      unit: 'CM',
      tabTitle: 'Size Guide'
    },
    bags: {
      isTable: false,
      tabTitle: 'Dimensions'
    },
    sunglasses: {
      isTable: false,
      tabTitle: 'Measurements'
    },
    jewelry: {
      isTable: false,
      tabTitle: 'Specifications'
    },
    parfum: {
      isTable: false,
      tabTitle: null // No tab
    },
    perfume: {
      isTable: false,
      tabTitle: null
    }
  };
  
  return configs[category] || {
    isTable: true,
    unit: 'CM',
    tabTitle: 'Size Guide'
  };
}

function buildSpecificationList(raw, config) {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  
  // Parse as CSV or key-value pairs
  const pairs = lines.map(line => {
    if (line.includes(',')) {
      const parts = line.split(',').map(p => p.trim());
      return { label: parts[0], value: parts.slice(1).join(', ') };
    }
    return null;
  }).filter(Boolean);
  
  const listItems = pairs.map(pair => `
    <div style="
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 14px 0;
      border-bottom: 1px solid #e8e8e8;
    ">
      <span style="
        font-size: 11px;
        font-weight: 400;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #333;
      ">${pair.label}</span>
      <span style="
        font-size: 12px;
        font-weight: 300;
        color: #666;
        letter-spacing: 0.02em;
      ">${pair.value}</span>
    </div>
  `).join('');
  
  // Determine if we need a note (skip for perfume and non-measurement specs)
  const showNote = !['parfum', 'perfume'].includes(config.category);
  
  return `
    <div style="
      background: #fff;
      font-family: inherit;
    ">
      <div style="
        text-align: right;
        font-size: 9px;
        font-weight: 400;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #999;
        margin-bottom: 8px;
        padding-right: 16px;
      ">${config.unit || ''}</div>
      <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
        <div style="min-width: 280px;">
          ${listItems}
        </div>
      </div>
      ${showNote ? `
        <p style="
          font-size: 10px;
          font-weight: 300;
          color: #999;
          margin-top: 16px;
          line-height: 1.8;
          letter-spacing: 0.03em;
        ">Measurements are provided as a guide. A variance of 1–3cm may occur.</p>
      ` : ''}
    </div>`;
}

// Updated renderProductPage function to use category-aware size guide
async function renderProductPage(product) {
  document.querySelectorAll(".page").forEach(pg=>pg.classList.remove("active")); 
  DOM.productDetail.classList.add("active"); 
  S.currentPage="product-detail"; 
  S.selectedSize=null;
  S.stickyWishHidden = false;
  
  if(DOM.mainNav) { 
    DOM.mainNav.classList.add("product-page"); 
    DOM.mainNav.classList.remove("collection-page"); 
  }
  
  showLoading(DOM.productDetail);
  
  const vi = S.productVariantSelections[product.id] ?? 0; 
  const images = getAllProductImages(product, vi); 
  const isWished = S.wishlist.some(w => w.id === product.id); 
  const soldOut = isProductSoldOut(product);
  const secondaryImages = getSecondaryImages(product, vi); 
  const secondaryImagesHtml = secondaryImages.length ? 
    secondaryImages.map(u => `<img src="${u}" alt="${product.name}" />`).join("") : '';
  
  const related = merchandiseProducts(
    PRODUCTS.filter(p => p.id !== product.id && p.category === product.category && p.status === 'active')
  ).slice(0, 6); 
  const relatedSection = related.length ? 
    buildSwipeSection('You May Also Like', related, `related-${product.id}`) : '';
  
  const ctl = getCompleteLookProducts(product); 
  const ctlSection = ctl.length ? 
    buildSwipeSection('Complete the Look', ctl, `ctl-${product.id}`) : '';
  
  const rv = S.recentlyViewed.filter(p => p.id !== product.id).slice(0, 6); 
  const rvSection = rv.length ? 
    buildSwipeSection('Recently Viewed', rv, `rv-${product.id}`) : '';
  
  const reviews = await getProductReviews(product.id); 
  const reviewsHtml = reviews.length ? 
    reviews.map(r => `<div style="font-size:12px;font-weight:300;color:#555;margin-bottom:10px;">
      ${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)} — ${r.text||'No comment'}<br>
      <small style="color:#aaa;">${r.name||'Anonymous'} · ${r.country||'Unknown'} · 
      ${r.createdAt ? new Date(r.createdAt.seconds*1000).toLocaleDateString() : 'Recently'}</small>
    </div>`).join('') : '<p class="no-reviews">No reviews yet.</p>';
  
  const slidesClass = (isDesktop() && images.length >= 4) ? '' : 'single-image';
  const hasDesc = product.description && product.description.length > 0; 
  const descWordCount = wordCount(product.description); 
  const showViewMore = descWordCount > 20;
  const wishIconClass = isWished ? "ph-fill ph-bookmark-simple" : "ph-thin ph-bookmark-simple";
  
  // Category-aware size guide logic
  const categoryConfig = getCategoryConfig(product.category);
  const hasSizeGuide = !!(product.measurements && product.measurements.trim().length > 0);
  const tabTitle = categoryConfig.tabTitle;
  
  // Don't show size guide tab for perfume
  const showSizeGuideTab = hasSizeGuide && tabTitle !== null;
  
  const sizeGuideHtml = hasSizeGuide ? 
    buildSizeTable(product.measurements, product.category) : '';
  
  DOM.productDetail.innerHTML = `
    <div class="product-slider" id="product-slider" style="position:relative;">
      <div class="product-slides ${slidesClass}" id="product-slides">
        ${images.map(u => `<div class="product-slide" style="background-image:url('${u}');"></div>`).join("")}
      </div>
    </div>
    <div class="product-info" style="margin-top:5px;">
      <div class="info-tabs-wrap">
        <button class="info-tab-btn active" data-tab="description" onclick="switchInfoTab('description')">Description</button>
        <button class="info-tab-btn" data-tab="composition" onclick="switchInfoTab('composition')">Composition</button>
        ${showSizeGuideTab ? `<button class="info-tab-btn" data-tab="measurements" onclick="switchInfoTab('measurements')">${tabTitle}</button>` : ''}
        <button class="info-tab-btn" data-tab="shipping" onclick="switchInfoTab('shipping')">Shipping</button>
      </div>
      <div class="info-tab-panel active" data-tab="description">
        ${hasDesc ? `<div class="modal-desc" id="modal-desc">${product.description||''}</div>
        ${showViewMore ? `<button class="modal-desc-toggle" id="desc-toggle" onclick="toggleDescExpand()">View More</button>` : ''}` : 
        '<p style="font-size:12px;font-weight:300;color:#888;">No description available.</p>'}
        <div class="product-brand-under-desc">
          <span>Brand: ${product.brand||''}</span>
          <button class="inline-wish-btn" onclick="event.stopPropagation();toggleWish('${product.id}');var t=this.querySelector('i');t.className=t.className.includes('ph-fill')?'ph-thin ph-bookmark-simple':'ph-fill ph-bookmark-simple';">
            <i class="${wishIconClass}"></i>
          </button>
        </div>
      </div>
      <div class="info-tab-panel" data-tab="composition">
        <p>${product.compositionCare||'No composition details available.'}</p>
      </div>
      ${showSizeGuideTab ? `<div class="info-tab-panel" data-tab="measurements" style="padding: 12px 0;">${sizeGuideHtml}</div>` : ''}
      <div class="info-tab-panel" data-tab="shipping">
        <p>${product.shippingReturns||'No shipping details available.'}</p>
        <div class="shipping-calc">
          <input id="postal-code-input" placeholder="Enter postal code">
          <button onclick="calculateShipping()">Calculate</button>
        </div>
        <div class="shipping-result" id="shipping-result"></div>
      </div>
    </div>
    ${secondaryImagesHtml ? `<div class="product-secondary-images">${secondaryImagesHtml}</div>` : ''}
    <div style="max-width:720px;margin:0 auto;padding:0 12px;">
      <div class="ai-disclaimer-notice">
        <span>*</span>
        <p>Select imagery may include AI-assisted production.<br><strong>Product accuracy remains a priority.</strong></p>
      </div>
      ${ctlSection}${relatedSection}
      <div class="reviews-section">
        <div class="reviews-title">Reviews</div>
        ${reviewsHtml}
        <button class="write-review-btn" onclick="openReviewModal()">Write a Review</button>
      </div>
      ${rvSection}
    </div>
    <div class="back-btn-wrap"><button class="back-btn" onclick="goBackFromProduct()">Back</button></div>
    <footer id="product-footer"></footer>`;
  
  buildFooter("product-footer"); 
  S.currentSlide = 0; 
  window.scrollTo({top:0,behavior:"smooth"}); 
  ensureNavScrolled(); 
  setTimeout(refreshSwipeTracks, 50);
  createStickyBar(product); 
  S.productInfoTab = 'description';
}
