/* ================================================================
   GLOBAL TYPOGRAPHY ENFORCEMENT
================================================================ */
* {
  font-family: 'Manrope', sans-serif !important;
}

/* Preserve icon fonts if you use any */
[class*="icon-"], [class*="fa-"], .material-icons, [class*="bi-"] {
  font-family: inherit !important;
}

/* ================================================================
   JANEDORE LOGO ENFORCEMENT
================================================================ */
/* Override ALL logo sources */
img[src*="logo"], 
img[alt*="logo"],
.logo-img,
.brand-logo,
.sidebar-logo,
.login-logo,
.mobile-logo,
.header-logo {
  content: url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/janedore-logo.png?v=1776021202') !important;
  object-fit: contain !important;
  max-width: 100% !important;
  height: auto !important;
}

/* Specific logo containers */
.sidebar .logo img,
.login-screen .logo img,
.mobile-nav .logo img {
  content: url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/janedore-logo.png?v=1776021202') !important;
  object-fit: contain !important;
}

/* ================================================================
   MODAL/PANEL STABILITY
================================================================ */
.modal-overlay,
.slide-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.modal-overlay {
  z-index: 1000;
}

.slide-panel-overlay {
  z-index: 1001;
}

.modal {
  position: relative;
  z-index: 1001;
}

.slide-panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  z-index: 1002;
}
