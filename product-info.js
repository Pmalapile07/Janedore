document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.info-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      const panel = document.getElementById(targetId);
      const isOpen = btn.classList.contains('active');

      document.querySelectorAll('.info-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.info-tab-panel').forEach(p => p.classList.remove('active'));

      if (!isOpen) {
        btn.classList.add('active');
        if (panel) panel.classList.add('active');
      }
    });
  });
});
