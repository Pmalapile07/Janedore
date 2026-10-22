/* ============================================================
   CATEGORY TREE: the one list of departments and categories.
   Each product has one category (product.category, a slug below); its
   department, label, place in the menu, sort order and kind of sizes all
   come from here. Loaded by the shop (index.html), admin (admin.html)
   and server.js, so all three always agree.

   To add a category: add it to its department's list. To rename one,
   change its name (never its slug, which products are saved with).
   LEGACY holds slugs products were saved with before this tree; they
   still work and show, but aren't offered for new products.
   ============================================================ */
(function (root) {
  // Kinds of sizes: the size filter has one section per kind, and the
  // admin product form fills in the preset for a new product.
  var SIZE_SYSTEMS = {
    clothing:     { label: 'Clothing sizes',     preset: { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' } },
    shoes:        { label: 'Shoe sizes',         preset: { unit: 'UK', sizes: '3, 4, 5, 6, 7, 8, 9, 10, 11, 12' } },
    kids:         { label: 'Kids’ sizes',      preset: { unit: 'Custom', sizes: '0-3M, 3-6M, 6-12M, 1-2Y, 2-3Y, 3-4Y, 4-5Y, 5-6Y, 7-8Y, 9-10Y, 11-12Y' } },
    'kids-shoes': { label: 'Kids’ shoe sizes', preset: { unit: 'UK', sizes: '4, 5, 6, 7, 8, 9, 10, 11, 12, 13' } }
  };
  var ONE_SIZE = { unit: 'OS', sizes: '' };

  // [slug, name, kind of sizes (blank: one size)]
  var DEPARTMENTS = [
    { slug: 'clothing', name: 'Clothing', sizeSystem: 'clothing', categories: [
      ['dresses', 'Dresses', 'clothing'], ['tops', 'Tops', 'clothing'], ['shirts', 'Shirts & Blouses', 'clothing'],
      ['t-shirts', 'T-shirts', 'clothing'], ['knitwear', 'Knitwear', 'clothing'], ['pants', 'Pants', 'clothing'],
      ['jeans', 'Jeans', 'clothing'], ['shorts', 'Shorts', 'clothing'], ['skirts', 'Skirts', 'clothing'],
      ['jackets', 'Jackets & Coats', 'clothing'], ['suits', 'Suits & Blazers', 'clothing'], ['sets', 'Sets & Co-ords', 'clothing'],
      ['jumpsuits', 'Jumpsuits', 'clothing'], ['activewear', 'Activewear', 'clothing'], ['swimwear', 'Swimwear', 'clothing'],
      ['lingerie', 'Lingerie & Sleepwear', 'clothing']
    ] },
    { slug: 'accessories', name: 'Accessories', categories: [
      ['shoes', 'Shoes', 'shoes'], ['bags', 'Bags', ''], ['jewelry', 'Jewellery', ''], ['sunglasses', 'Sunglasses', ''],
      ['belts', 'Belts', ''], ['hats', 'Hats & Caps', ''], ['scarves', 'Scarves', ''], ['hair-accessories', 'Hair Accessories', ''],
      ['wallets', 'Wallets & Purses', ''], ['watches', 'Watches', '']
    ] },
    { slug: 'homeware', name: 'Homeware', categories: [
      ['tableware', 'Tableware', ''], ['drinkware', 'Drinkware', ''], ['kitchen', 'Kitchen', ''], ['candles', 'Candles', ''],
      ['home-fragrance', 'Home Fragrance', ''], ['decor', 'Décor', ''], ['vases', 'Vases', ''], ['bedding', 'Bedding', ''],
      ['bath', 'Bath & Towels', ''], ['cushions', 'Cushions & Throws', ''], ['lighting', 'Lighting', ''],
      ['wall-art', 'Wall Art', ''], ['storage', 'Storage', '']
    ] },
    { slug: 'beauty', name: 'Beauty', categories: [
      // 'parfum' is the slug Scent products were already saved with.
      ['parfum', 'Fragrance', ''], ['skincare', 'Skincare', ''], ['makeup', 'Makeup', ''], ['hair-care', 'Hair Care', ''],
      ['bath-body', 'Bath & Body', ''], ['nails', 'Nails', ''], ['beauty-tools', 'Beauty Tools', '']
    ] },
    { slug: 'kids', name: 'Kids', sizeSystem: 'kids', categories: [
      ['girls', 'Girls’ Clothing', 'kids'], ['boys', 'Boys’ Clothing', 'kids'], ['baby', 'Baby (0–24 months)', 'kids'],
      ['kids-shoes', 'Kids’ Shoes', 'kids-shoes'], ['kids-accessories', 'Kids’ Accessories', ''], ['toys', 'Toys', ''],
      ['nursery', 'Nursery', '']
    ] }
  ];

  // Saved before this tree. 'homeware' products sit in Homeware with no
  // narrower category until they're re-picked.
  var LEGACY = { bottoms: ['clothing', 'Bottoms', 'clothing'], homeware: ['homeware', 'Homeware', ''] };

  // Old department page addresses.
  var DEPARTMENT_ALIASES = { 'all-clothing': 'clothing', 'all-accessories': 'accessories' };

  var GENDERS = [['women', 'Women'], ['men', 'Men'], ['unisex', 'Unisex']];

  var categories = {};
  var order = 0;
  DEPARTMENTS.forEach(function (d) {
    d.categories = d.categories.map(function (c) {
      var cat = { slug: c[0], name: c[1], department: d.slug, sizeSystem: c[2] || null, order: ++order };
      categories[cat.slug] = cat;
      return cat;
    });
  });
  Object.keys(LEGACY).forEach(function (slug) {
    var l = LEGACY[slug];
    categories[slug] = { slug: slug, name: l[1], department: l[0], sizeSystem: l[2] || null, order: ++order, legacy: true };
  });

  function department(slug) {
    slug = DEPARTMENT_ALIASES[slug] || slug;
    for (var i = 0; i < DEPARTMENTS.length; i++) if (DEPARTMENTS[i].slug === slug) return DEPARTMENTS[i];
    return null;
  }

  function category(slug) { return categories[slug] || null; }

  var Taxonomy = {
    DEPARTMENTS: DEPARTMENTS,
    SIZE_SYSTEMS: SIZE_SYSTEMS,
    GENDERS: GENDERS,
    department: department,
    category: category,
    // The department a category slug is in, or null. A product saved with
    // a department's own slug (e.g. 'clothing') is in that department.
    departmentOf: function (slug) {
      var c = categories[slug];
      if (c) return c.department;
      var d = department(slug);
      return d ? d.slug : null;
    },
    // Every category slug in a department, legacy ones and the
    // department's own slug included.
    categoriesIn: function (deptSlug) {
      var d = department(deptSlug);
      if (!d) return [];
      return [d.slug].concat(Object.keys(categories).filter(function (s) { return s !== d.slug && categories[s].department === d.slug; }));
    },
    // Display name for a category or department slug.
    label: function (slug) {
      var d = department(slug);
      if (d) return d.name;
      var c = categories[slug];
      return c ? c.name : String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); });
    },
    // Position in the tree, for sorting (unknown slugs last). A
    // department's own slug sorts with its first category.
    order: function (slug) {
      var c = categories[slug];
      if (c) return c.order;
      var d = department(slug);
      return d && d.categories.length ? d.categories[0].order : 999;
    },
    // A department's own slug uses the department's usual sizes.
    sizeSystem: function (slug) {
      var c = categories[slug];
      if (c) return c.sizeSystem;
      var d = department(slug);
      return d ? (d.sizeSystem || null) : null;
    },
    sizePreset: function (slug) { var s = Taxonomy.sizeSystem(slug); return s ? SIZE_SYSTEMS[s].preset : ONE_SIZE; },
    // Products saved before Gender existed are womenswear.
    genderOf: function (product) { return (product && product.gender) || 'women'; },
    genderLabel: function (g) { for (var i = 0; i < GENDERS.length; i++) if (GENDERS[i][0] === g) return GENDERS[i][1]; return g; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Taxonomy;
  else root.JDTaxonomy = Taxonomy;
})(this);
