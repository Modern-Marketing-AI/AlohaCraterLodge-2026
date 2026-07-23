// 1. Dynamic Tab-Title Hacking (Loss Aversion)
const originalTitle = document.title;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    document.title = '⚠️ (1) Direct E-Bike Pass Reserved...';
  } else {
    document.title = originalTitle;
  }
});

// 2. Exit-Intent & Mobile Back-Swipe Intercept
document.addEventListener('DOMContentLoaded', () => {
  // Prevent re-triggering in same session
  if (sessionStorage.getItem('exitModalDismissed')) return;

  // Inject Modal HTML into DOM
  const modalHTML = `
    <div id="exit-intent-modal" class="exit-modal-overlay">
      <div class="exit-modal-content">
        <div class="modal-title">✋ Hold On — Don't Leave Your Perks Behind</div>
        <div class="modal-body">
          Booking on third-party sites adds platform service fees and excludes your complimentary e-bike trail pass.<br><br>
          Lock in $0 added fees and free e-bike passes by completing your booking right now.
        </div>
        <a href="https://hotels.cloudbeds.com/en/reservation/ifCVNX" class="modal-btn btn-direct">🟢 CLAIM PERKS & BOOK HERE</a>
        <button class="modal-btn btn-ota close-exit-modal">Continue to Third-Party OTA</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('exit-intent-modal');
  const closeBtns = document.querySelectorAll('.close-exit-modal');

  const dismissModal = () => {
    modal.style.display = 'none';
    sessionStorage.setItem('exitModalDismissed', 'true');
  };

  closeBtns.forEach(btn => btn.addEventListener('click', dismissModal));

  // Desktop Exit-Intent (Mouse leaves top of viewport)
  document.addEventListener('mouseout', (e) => {
    if (e.clientY < 50 && e.relatedTarget == null && !sessionStorage.getItem('exitModalDismissed')) {
      modal.style.display = 'flex';
    }
  });

  // Mobile Back-Swipe / History Intercept
  window.history.pushState({ capture: 'active' }, '');
  window.addEventListener('popstate', () => {
    if (!sessionStorage.getItem('exitModalDismissed')) {
      modal.style.display = 'flex';
      window.history.pushState({ capture: 'active' }, '');
    }
  });
});
