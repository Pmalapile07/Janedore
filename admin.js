/* ================================================================
   CRITICAL: PREVENT EMPTY OVERLAYS FROM BLOCKING LOGIN
================================================================ */
#modal-container:empty,
#panel-container:empty {
  display: none !important;
  pointer-events: none !important;
}

#modal-container,
#panel-container {
  pointer-events: none;
}

#modal-container > *,
#panel-container > * {
  pointer-events: auto;
}

/* ================================================================
   GLOBAL TYPOGRAPHY ENFORCEMENT
================================================================ */
* {
  font-family: 'Manrope', sans-serif !important;
}

/* Preserve icon fonts */
[class*="icon-"], 
[class*="fa-"], 
.material-icons, 
[class*="bi-"],
[class*="glyphicon"] {
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
.mobile-nav .logo img,
.header .logo img {
  content: url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/janedore-logo.png?v=1776021202') !important;
  object-fit: contain !important;
  width: auto !important;
  max-height: 40px !important;
}

/* Login screen specific logo sizing */
.login-screen .logo img {
  max-height: 60px !important;
  margin-bottom: 20px;
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
  pointer-events: auto;
}

.slide-panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  z-index: 1002;
  pointer-events: auto;
}

/* Close button safety */
.modal-close,
.slide-panel-close {
  cursor: pointer;
  z-index: 10;
  position: relative;
  pointer-events: auto;
}

/* ================================================================
   LOGIN SCREEN SAFETY
================================================================ */
#login-screen {
  position: relative;
  z-index: 1;
}

#login-screen form {
  position: relative;
  z-index: 2;
  pointer-events: auto;
}

#login-screen input,
#login-screen button {
  pointer-events: auto;
  position: relative;
  z-index: 3;
}
