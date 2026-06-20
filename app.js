function initNavScroll() { 
  window.addEventListener("scroll", () => { 
    if (!DOM.mainNav) return;
    if (window.scrollY > 10) {
      DOM.mainNav.classList.add("scrolled");
    } else {
      DOM.mainNav.classList.remove("scrolled");
    }
    updateStickyBarOnScroll(); 
  }, { passive: true }); 
}
