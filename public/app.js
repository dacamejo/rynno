(async () => {
  const status = document.getElementById('sw-status');
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Service worker not supported in this browser.';
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
    status.textContent = 'Service worker ready. You can now share trips to Rynno.';
  } catch (error) {
    status.textContent = `Service worker registration failed: ${error.message}`;
  }
})();
