/* CRITICAL: Prevent empty overlays from blocking login */
#modal-container:empty,
#panel-container:empty {
  display: none !important;
  pointer-events: none !important;
}

#modal-container,
#panel-container {
  pointer-events: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
}

#modal-container > *,
#panel-container > * {
  pointer-events: auto;
}

/* Global font */
* {
  font-family: 'Manrope', sans-serif !important;
}

/* Logo enforcement */
img[src*="logo"], 
.logo-img,
.brand-logo,
.sidebar-logo,
.login-logo {
  content: url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/janedore-logo.png?v=1776021202') !important;
  object-fit: contain !important;
  max-width: 100% !important;
  height: auto !important;
}

/* Modal/Panel fixes */
.modal-overlay,
.slide-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
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
  background: #fff;
  overflow-y: auto;
}

.modal-close,
.slide-panel-close {
  cursor: pointer;
  z-index: 10;
  position: relative;
  pointer-events: auto;
}

/* Login screen safety */
#login-screen {
  position: relative;
  z-index: 1;
}

#login-screen form,
#login-screen input,
#login-screen button {
  pointer-events: auto;
  position: relative;
  z-index: 2;
}
