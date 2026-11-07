/* JANEDORE customer contact and South African address validation. */
(function () {
  'use strict';
  const PROVINCES = ["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","Northern Cape","North West","Western Cape"];
  const provinceMap = new Map(PROVINCES.map(x => [x.toLowerCase(), x]));
  function normalizePhone(raw) {
    let value = String(raw || '').trim().replace(/[\s().-]/g, '');
    if (value.startsWith('00')) value = '+' + value.slice(2);
    if (value.startsWith('+27')) value = '0' + value.slice(3);
    else if (value.startsWith('27') && value.length === 11) value = '0' + value.slice(2);
    return /^0[1-8]\d{8}$/.test(value) ? value : '';
  }
  function validEmail(raw) {
    const value = String(raw || '').trim();
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value);
  }
  function normalizeProvince(raw) {
    return provinceMap.get(String(raw || '').trim().toLowerCase()) || '';
  }
  function validPlaceName(value) { return /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 .,'’()/-]{1,79}$/.test(String(value || '').trim()); }
  function cleanText(raw, max) {
    const value = String(raw || '').trim();
    return value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function validateAddress(a, required) {
    const any = [a.street, a.suburb, a.city, a.province, a.postalCode].some(v => String(v || '').trim());
    if (!required && !any) return { ok: true, address: null };
    const address = {
      street: String(a.street || '').trim(), suburb: String(a.suburb || '').trim(),
      city: String(a.city || '').trim(), province: normalizeProvince(a.province),
      postalCode: String(a.postalCode || '').trim()
    };
    if (!cleanText(address.street, 120) || address.street.length < 5) return { ok: false, field: 'street', message: 'Enter a complete street address, including the building or house number.' };
    if (!cleanText(address.suburb, 80) || !validPlaceName(address.suburb)) return { ok: false, field: 'suburb', message: 'Enter a valid suburb or local area.' };
    if (!cleanText(address.city, 80) || !validPlaceName(address.city)) return { ok: false, field: 'city', message: 'Enter a valid city or town.' };
    if (!address.province) return { ok: false, field: 'province', message: 'Choose one of South Africa’s nine provinces.' };
    if (!/^\d{4}$/.test(address.postalCode)) return { ok: false, field: 'postalCode', message: 'Enter a 4-digit South African postal code.' };
    return { ok: true, address };
  }
  function validatePhone(raw, required) {
    if (!String(raw || '').trim() && !required) return { ok: true, phone: '' };
    const phone = normalizePhone(raw);
    return phone ? { ok: true, phone } : { ok: false, message: 'Enter a valid South African number, e.g. 082 123 4567 or +27 82 123 4567.' };
  }
  function validateCheckout() {
    const get = id => document.getElementById(id);
    const emailEl = get('checkout-email'), phoneEl = get('checkout-phone');
    if (!emailEl || !phoneEl) return { ok: true };
    const email = emailEl.value.trim();
    if (!validEmail(email)) {
      emailEl.setCustomValidity('Enter a valid email address, for example name@example.co.za.');
      emailEl.reportValidity(); emailEl.setCustomValidity(''); return { ok: false };
    }
    const phone = validatePhone(phoneEl.value, true);
    if (!phone.ok) {
      phoneEl.setCustomValidity(phone.message); phoneEl.reportValidity(); phoneEl.setCustomValidity(''); return { ok: false };
    }
    phoneEl.value = phone.phone; emailEl.value = email;
    const shipments = typeof getCartShipments === 'function' ? getCartShipments() : [];
    const collectOnly = shipments.length > 0 && shipments.every(s => s.collect);
    if (!collectOnly) {
      const address = validateAddress({
        street: get('checkout-address') && get('checkout-address').value,
        suburb: get('checkout-suburb') && get('checkout-suburb').value,
        city: get('checkout-city') && get('checkout-city').value,
        province: get('checkout-province') && get('checkout-province').value,
        postalCode: get('checkout-postal') && get('checkout-postal').value
      }, true);
      if (!address.ok) {
        const ids = { street: 'checkout-address', suburb: 'checkout-suburb', city: 'checkout-city', province: 'checkout-province', postalCode: 'checkout-postal' };
        const el = get(ids[address.field]);
        if (el) { el.setCustomValidity(address.message); el.reportValidity(); el.setCustomValidity(''); }
        return { ok: false };
      }
      get('checkout-province').value = address.address.province;
      get('checkout-postal').value = address.address.postalCode;
    }
    return { ok: true };
  }
  function useCurrentLocation(prefix) {
    const button = document.getElementById(prefix + '-use-location');
    const status = document.getElementById(prefix + '-location-status');
    const setStatus = (message, isError) => {
      if (status) { status.textContent = message; status.style.color = isError ? '#b42318' : '#666'; }
    };
    if (!navigator.geolocation) { setStatus('Location is not available in this browser. You can enter your address manually.', true); return; }
    if (button) { button.disabled = true; button.textContent = 'Finding location…'; }
    setStatus('Allow location access when asked. Your coordinates are sent to OpenStreetMap to suggest an address and are not saved by JANEDORE. Please review the suggestion.');
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const url = '/api/geocode/reverse?lat=' + encodeURIComponent(position.coords.latitude) + '&lon=' + encodeURIComponent(position.coords.longitude);
        const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'We could not find an address for this location.');
        const put = (id, value) => {
          const el = document.getElementById(prefix + '-' + id);
          if (el && value) { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }
        };
        put('address', data.street); put('suburb', data.suburb); put('city', data.city);
        put('province', data.province); put('postal', data.postalCode);
        setStatus('Address suggestion added. Please check the street number and details before continuing.');
      } catch (error) {
        setStatus(error.message || 'We could not look up this location. Please enter your address manually.', true);
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Use my current location'; }
      }
    }, error => {
      const message = error.code === 1 ? 'Location permission was denied. You can enter your address manually.'
        : error.code === 2 ? 'Your location could not be determined. Try again or enter it manually.'
        : 'Location lookup timed out. Try again or enter your address manually.';
      setStatus(message, true);
      if (button) { button.disabled = false; button.textContent = 'Use my current location'; }
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-jd-use-location]');
    if (button) { e.preventDefault(); useCurrentLocation(button.getAttribute('data-jd-use-location')); }
  });
  document.addEventListener('blur', e => {
    if (e.target && e.target.id === 'checkout-phone') {
      const normalized = normalizePhone(e.target.value);
      if (normalized) e.target.value = normalized;
    }
    if (e.target && e.target.id === 'checkout-postal') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  }, true);
  window.JDValidation = { PROVINCES, normalizePhone, validEmail, normalizeProvince, validateAddress, validatePhone, validateCheckout };
})();
