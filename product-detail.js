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
    return `<div class="size-guide-container">
      <p style="white-space:pre-line;font-size:var(--body-font-size);font-weight:300;line-height:2;color:#666;padding:16px 0;">${raw}</p>
    </div>`;
  }
  
  const rows = lines.map(l => l.split(',').map(c => c.trim()));
  const header = rows[0];
  const body = rows.slice(1);
  
  const headerHtml = header.map((h, i) => 
    `<th>${h}</th>`
  ).join('');
  
  const bodyHtml = body.map(row => {
    const cells = row.map(cell => `<td>${cell}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  
  return `
    <div class="size-guide-container">
      <div class="size-guide-unit-label">${categoryConfig.unit || 'CM'}</div>
      <div class="size-guide-table-wrap">
        <table class="size-guide-table">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
      <p class="size-guide-note">Measurements are provided as a guide. A variance of 1–3cm may occur.</p>
    </div>`;
}

function buildSpecificationList(raw, config) {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  
  // Parse CSV or key-value pairs
  const pairs = lines.map(line => {
    if (line.includes(',')) {
      const parts = line.split(',').map(p => p.trim());
      return { label: parts[0], value: parts.slice(1).join(', ') };
    }
    return null;
  }).filter(Boolean);
  
  const listItems = pairs.map(pair => `
    <div class="spec-list-item">
      <span class="spec-list-label">${pair.label}</span>
      <span class="spec-list-value">${pair.value}</span>
    </div>
  `).join('');
  
  // Only show note for measurement-based specs (not perfume)
  const showNote = !['parfum', 'perfume'].includes(config.category);
  
  return `
    <div class="spec-list">
      <div class="size-guide-unit-label">${config.unit || ''}</div>
      <div class="spec-list-wrap">
        <div class="spec-list-inner">
          ${listItems}
        </div>
      </div>
      ${showNote ? `
        <p class="size-guide-note">Measurements are provided as a guide. A variance of 1–3cm may occur.</p>
      ` : ''}
    </div>`;
}
