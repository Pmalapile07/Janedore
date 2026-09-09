(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var fmt        = window._fmt;
  var fmtDate    = window._fmtDate;
  var showToast  = window._showToast;
  var statusBadge = window._statusBadge;
  var mountModal = window._mountModal;
  var closeModal = window._closeModal;
  
  var discountsRef = window._discountsRef || window._adminDB.collection('discounts');

  /* ─────────────────────────────────────────────────────────
     RENDER DISCOUNTS TAB — role-based
  ───────────────────────────────────────────────────────── */
  window._renderDiscountsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    var role = window._currentUserRole;
    var canManage = (role === 'SUPER_ADMIN' || role === 'ADMIN');

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Discounts</div>' +
        '<div style="display:flex;gap:8px;">' +
          (canManage
            ? '<button class="btn btn-sm btn-primary" onclick="window._openNewDiscountModal()">+ Create Discount</button>'
            : '<span class="ui-label">Read-only view</span>') +
        '</div>' +
      '</div>' +
      '<div id="discounts-list"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></div>';

    discountsRef.orderBy('createdAt', 'desc').get().then(function(snapshot) {
      window._allDiscounts = snapshot.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });

      renderDiscountsList(window._allDiscounts, canManage);
    }).catch(function(e) {
      console.error('[DISCOUNTS_TAB]', e);
      var el = safeEl('discounts-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load discounts.</div><button class="btn btn-sm btn-ghost" style="margin-top:12px;" onclick="window._renderDiscountsTab()">Retry</button></div>';
    });
  };

  /* ─────────────────────────────────────────────────────────
     DISCOUNTS LIST (Mobile-First Card Layout)
  ───────────────────────────────────────────────────────── */
  function renderDiscountsList(discounts, canManage) {
    var el = safeEl('discounts-list');
    if (!el) return;

    if (discounts.length === 0) {
      el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-tag"></i></div>' +
        '<div class="orders-empty-title">No discounts yet</div>' +
        '<div class="orders-empty-sub">Create discount codes to offer promotions to your customers.</div>' +
        (canManage ? '<button class="orders-empty-btn" onclick="window._openNewDiscountModal()">Create your first discount</button>' : '') +
      '</div>';
      return;
    }

    var discountTypeLabels = {
      percentage: 'Percentage',
      fixed_amount: 'Fixed Amount',
      free_shipping: 'Free Shipping',
      buy_x_get_y: 'Buy X Get Y'
    };

    var discountTypeIcons = {
      percentage: 'ph-percent',
      fixed_amount: 'ph-currency-zar',
      free_shipping: 'ph-truck',
      buy_x_get_y: 'ph-gift'
    };

    el.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      discounts.map(function(d) {
        var typeLabel = discountTypeLabels[d.type] || d.type;
        var typeIcon = discountTypeIcons[d.type] || 'ph-tag';
        
        var valueDisplay = '—';
        if (d.type === 'percentage') valueDisplay = d.value + '% off';
        else if (d.type === 'fixed_amount') valueDisplay = fmt(d.value) + ' off';
        else if (d.type === 'buy_x_get_y') valueDisplay = 'Buy ' + d.value + ' Get 1';
        else if (d.type === 'free_shipping') valueDisplay = 'Free Shipping';

        var usageDisplay = (d.usageCount || 0).toString();
        if (d.usageLimit) usageDisplay += ' / ' + d.usageLimit;
        else usageDisplay += ' uses';

        var statusBadgeHtml = d.active ? 
          '<span class="badge badge-active" style="background:var(--success-soft);color:var(--success);">Active</span>' : 
          '<span class="badge badge-inactive" style="background:var(--surface3);color:var(--muted);">Inactive</span>';

        var datesDisplay = '—';
        if (d.startDate && d.endDate) {
          datesDisplay = fmtDate(d.startDate) + ' - ' + fmtDate(d.endDate);
        } else if (d.startDate) {
          datesDisplay = 'From ' + fmtDate(d.startDate);
        } else if (d.endDate) {
          datesDisplay = 'Until ' + fmtDate(d.endDate);
        }

        var minPurchaseDisplay = d.minimumPurchase ? 'Min. ' + fmt(d.minimumPurchase) : 'No minimum';

        return '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r-sm);padding:16px;box-shadow:var(--shadow-xs);">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px;">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:16px;font-weight:600;color:var(--text);letter-spacing:.03em;text-transform:uppercase;margin-bottom:2px;">' + esc(d.code) + '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:var(--r-xs);font-size:11px;font-weight:600;background:var(--teal-soft, rgba(13,148,136,0.08));color:var(--teal, #0d9488);">' +
                  '<i class="ph-light ' + esc(typeIcon) + '" style="font-size:13px;"></i> ' + esc(typeLabel) +
                '</span>' +
                statusBadgeHtml +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;">' +
              '<span style="color:var(--muted);">Value</span>' +
              '<span style="color:var(--text);font-weight:500;">' + esc(valueDisplay) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;">' +
              '<span style="color:var(--muted);">Usage</span>' +
              '<span style="color:var(--text);font-weight:500;">' + esc(usageDisplay) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;">' +
              '<span style="color:var(--muted);">Requirements</span>' +
              '<span style="color:var(--text);font-weight:500;">' + esc(minPurchaseDisplay) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;">' +
              '<span style="color:var(--muted);">Validity</span>' +
              '<span style="color:var(--text);font-weight:500;">' + esc(datesDisplay) + '</span>' +
            '</div>' +
          '</div>' +

          (canManage
            ? '<div style="display:flex;gap:8px;padding-top:12px;border-top:0.5px solid var(--border-light);">' +
                '<button class="btn btn-xs btn-ghost" style="flex:1;justify-content:center;" onclick="window._toggleDiscountStatus(\'' + esc(d.id) + '\')">' +
                  (d.active ? 'Deactivate' : 'Activate') +
                '</button>' +
                '<button class="btn btn-xs btn-ghost" style="flex:1;justify-content:center;color:var(--danger);" onclick="window._deleteDiscount(\'' + esc(d.id) + '\')">' +
                  'Delete' +
                '</button>' +
              '</div>'
            : '') +
        '</div>';
      }).join('') +
      '</div>';
  }

  /* ─────────────────────────────────────────────────────────
     OPEN NEW DISCOUNT MODAL
  ───────────────────────────────────────────────────────── */
  window._openNewDiscountModal = function() {
    var role = window._currentUserRole;
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      showToast('You do not have permission to create discounts.', 'error');
      return;
    }

    var modalHTML = '<div class="modal modal-sm">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
      '<div class="modal-title">Create Discount</div>' +
      '<form id="discount-form" onsubmit="window._handleDiscountSubmit(event)">' +

        '<div class="form-group">' +
          '<label>Discount Code</label>' +
          '<input name="code" required placeholder="e.g. SUMMER20" style="text-transform:uppercase;" pattern="[A-Za-z0-9_-]{3,20}" title="3-20 characters (letters, numbers, underscores, hyphens)">' +
          '<div style="font-size:10px;color:var(--muted);margin-top:4px;">3-20 characters: letters, numbers, underscores, hyphens</div>' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Discount Type</label>' +
          '<select name="type" id="discount-type-select" onchange="window._toggleDiscountTypeFields()">' +
            '<option value="percentage">Percentage</option>' +
            '<option value="fixed_amount">Fixed Amount</option>' +
            '<option value="free_shipping">Free Shipping</option>' +
            '<option value="buy_x_get_y">Buy X Get Y</option>' +
          '</select>' +
        '</div>' +

        '<div class="form-group" id="discount-value-group">' +
          '<label>Discount Value</label>' +
          '<input name="value" type="number" min="0" max="100" step="0.01" required placeholder="Enter discount value">' +
          '<div id="discount-value-hint" style="font-size:10px;color:var(--muted);margin-top:4px;">Percentage discount (0-100%)</div>' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Applies To</label>' +
          '<select name="appliesTo">' +
            '<option value="all_products">All Products</option>' +
            '<option value="specific_products">Specific Products</option>' +
            '<option value="specific_collections">Specific Collections</option>' +
          '</select>' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Minimum Purchase Amount (R)</label>' +
          '<input name="minimumPurchase" type="number" min="0" step="0.01" placeholder="No minimum">' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Usage Limit</label>' +
          '<input name="usageLimit" type="number" min="0" step="1" placeholder="Unlimited">' +
        '</div>' +

        '<div class="form-row">' +
          '<div class="form-group"><label>Start Date</label><input name="startDate" type="date"></div>' +
          '<div class="form-group"><label>End Date</label><input name="endDate" type="date"></div>' +
        '</div>' +

        '<div style="display:flex;gap:10px;padding:14px 20px 4px;">' +
          '<button type="button" class="btn btn-ghost" onclick="window._closeModal()">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">Create Discount</button>' +
        '</div>' +

      '</form>' +
    '</div>';

    mountModal(modalHTML);
  };

  /* ─────────────────────────────────────────────────────────
     TOGGLE DISCOUNT TYPE FIELDS
  ───────────────────────────────────────────────────────── */
  window._toggleDiscountTypeFields = function() {
    var typeSelect = safeEl('discount-type-select');
    var valueGroup = safeEl('discount-value-group');
    var valueInput = valueGroup ? valueGroup.querySelector('input[name="value"]') : null;
    var valueHint = safeEl('discount-value-hint');

    if (!typeSelect || !valueGroup || !valueInput || !valueHint) return;

    var type = typeSelect.value;

    if (type === 'free_shipping') {
      valueGroup.style.display = 'none';
      valueInput.removeAttribute('required');
    } else if (type === 'buy_x_get_y') {
      valueGroup.style.display = 'block';
      valueInput.setAttribute('max', '100');
      valueInput.setAttribute('min', '1');
      valueInput.setAttribute('step', '1');
      valueInput.setAttribute('placeholder', 'Enter number of items');
      valueHint.textContent = 'Number of items customer buys (X)';
      valueInput.setAttribute('required', 'required');
    } else if (type === 'percentage') {
      valueGroup.style.display = 'block';
      valueInput.setAttribute('max', '100');
      valueInput.setAttribute('min', '0');
      valueInput.setAttribute('step', '0.01');
      valueInput.setAttribute('placeholder', 'Enter discount value');
      valueHint.textContent = 'Percentage discount (0-100%)';
      valueInput.setAttribute('required', 'required');
    } else if (type === 'fixed_amount') {
      valueGroup.style.display = 'block';
      valueInput.removeAttribute('max');
      valueInput.setAttribute('min', '0');
      valueInput.setAttribute('step', '0.01');
      valueInput.setAttribute('placeholder', 'Enter discount amount');
      valueHint.textContent = 'Fixed amount discount in Rands';
      valueInput.setAttribute('required', 'required');
    }
  };

  /* ─────────────────────────────────────────────────────────
     HANDLE DISCOUNT SUBMIT
  ───────────────────────────────────────────────────────── */
  window._handleDiscountSubmit = function(e) {
    e.preventDefault();
    
    var form = e.target;
    var code = form.code.value.trim().toUpperCase();
    var type = form.type.value;
    var value = form.value.value;
    var appliesTo = form.appliesTo.value;
    var minPurchase = form.minimumPurchase.value;
    var usageLimit = form.usageLimit.value;
    var startDate = form.startDate.value;
    var endDate = form.endDate.value;

    // Validate code format
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
      showToast('Discount code must be 3-20 characters (letters, numbers, underscores, hyphens)', 'error');
      return false;
    }

    // Validate discount rate based on type
    if (type !== 'free_shipping') {
      var rateValidation = validateDiscountRate(type, value);
      if (!rateValidation.valid) {
        showToast(rateValidation.message, 'error');
        return false;
      }
    }

    // Validate usage limit
    var usageValidation = validateDiscountUsageLimit(usageLimit);
    if (!usageValidation.valid) {
      showToast(usageValidation.message, 'error');
      return false;
    }

    // Validate minimum purchase
    var minPurchaseValidation = validateMinimumPurchase(minPurchase);
    if (!minPurchaseValidation.valid) {
      showToast(minPurchaseValidation.message, 'error');
      return false;
    }

    // Validate dates
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      showToast('Start date must be before end date', 'error');
      return false;
    }

    var discountData = {
      code: code,
      type: type,
      value: type === 'free_shipping' ? null : Number(value),
      appliesTo: appliesTo,
      minimumPurchase: minPurchaseValidation.value,
      usageLimit: usageValidation.value,
      usageCount: 0,
      startDate: startDate || null,
      endDate: endDate || null,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: window._currentUser ? window._currentUser.uid : null
    };

    // Check if code already exists
    discountsRef.where('code', '==', code).get().then(function(snapshot) {
      if (!snapshot.empty) {
        showToast('Discount code already exists', 'error');
        return;
      }

      discountsRef.add(discountData).then(function(docRef) {
        showToast('Discount created successfully!');
        closeModal();
        window._renderDiscountsTab();
      }).catch(function(err) {
        console.error('[CREATE_DISCOUNT]', err);
        showToast('Failed to create discount: ' + err.message, 'error');
      });
    }).catch(function(err) {
      console.error('[CHECK_DISCOUNT_CODE]', err);
      showToast('Failed to check discount code: ' + err.message, 'error');
    });

    return false;
  };

  /* ─────────────────────────────────────────────────────────
     TOGGLE DISCOUNT STATUS
  ───────────────────────────────────────────────────────── */
  window._toggleDiscountStatus = function(discountId) {
    var discount = (window._allDiscounts || []).find(function(d) { return d.id === discountId; });
    if (!discount) return;

    discountsRef.doc(discountId).update({
      active: !discount.active
    }).then(function() {
      showToast('Discount ' + (discount.active ? 'deactivated' : 'activated') + ' successfully');
      window._renderDiscountsTab();
    }).catch(function(err) {
      console.error('[TOGGLE_DISCOUNT]', err);
      showToast('Failed to toggle discount: ' + err.message, 'error');
    });
  };

  /* ─────────────────────────────────────────────────────────
     DELETE DISCOUNT
  ───────────────────────────────────────────────────────── */
  window._deleteDiscount = function(discountId) {
    if (!confirm('Are you sure you want to delete this discount?')) return;

    discountsRef.doc(discountId).delete().then(function() {
      showToast('Discount deleted successfully');
      window._renderDiscountsTab();
    }).catch(function(err) {
      console.error('[DELETE_DISCOUNT]', err);
      showToast('Failed to delete discount: ' + err.message, 'error');
    });
  };

  /* ─────────────────────────────────────────────────────────
     VALIDATION FUNCTIONS
  ───────────────────────────────────────────────────────── */
  function validateDiscountRate(type, value) {
    var limits = {
      MAX_PERCENTAGE: 100,
      MIN_PERCENTAGE: 0,
      MAX_FIXED_AMOUNT: 1000000,
      MIN_FIXED_AMOUNT: 0
    };
    
    value = Number(value || 0);

    switch(type) {
      case 'percentage':
        if (value < limits.MIN_PERCENTAGE || value > limits.MAX_PERCENTAGE) {
          return { valid: false, message: 'Percentage discount must be between ' + limits.MIN_PERCENTAGE + '% and ' + limits.MAX_PERCENTAGE + '%' };
        }
        break;
      case 'fixed_amount':
        if (value < limits.MIN_FIXED_AMOUNT || value > limits.MAX_FIXED_AMOUNT) {
          return { valid: false, message: 'Fixed amount must be between R' + limits.MIN_FIXED_AMOUNT + ' and R' + limits.MAX_FIXED_AMOUNT.toLocaleString() };
        }
        break;
      case 'buy_x_get_y':
        if (value < 1 || value > 100) {
          return { valid: false, message: 'Buy X Get Y requires X to be between 1 and 100' };
        }
        break;
      default:
        return { valid: false, message: 'Invalid discount type' };
    }
    return { valid: true, value: value };
  }

  function validateDiscountUsageLimit(limit) {
    if (limit === null || limit === undefined || limit === '') return { valid: true, value: null };
    limit = Number(limit);
    if (limit < 0 || limit > 1000000) {
      return { valid: false, message: 'Usage limit must be between 0 and 1,000,000' };
    }
    return { valid: true, value: limit };
  }

  function validateMinimumPurchase(amount) {
    if (amount === null || amount === undefined || amount === '') return { valid: true, value: null };
    amount = Number(amount);
    if (amount < 0 || amount > 1000000) {
      return { valid: false, message: 'Minimum purchase must be between R0 and R1,000,000' };
    }
    return { valid: true, value: amount };
  }

})();
