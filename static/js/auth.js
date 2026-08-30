/**
 * FarmBranch Auth & Utility Helpers
 */

const FB_AUTH = {
  // Toast notification helper
  showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <span style="font-size: 1.2rem;">${icon}</span>
      <div style="flex: 1; font-size: 0.88rem; font-weight: 500;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // FPO Session Management
  getFpoSession() {
    try {
      const session = localStorage.getItem('fb_fpo_session') || sessionStorage.getItem('fb_fpo_session');
      return session ? JSON.parse(session) : null;
    } catch (e) {
      return null;
    }
  },

  setFpoSession(fpoData, remember = false) {
    if (remember) {
      localStorage.setItem('fb_fpo_session', JSON.stringify(fpoData));
    } else {
      sessionStorage.setItem('fb_fpo_session', JSON.stringify(fpoData));
    }
  },

  clearFpoSession() {
    localStorage.removeItem('fb_fpo_session');
    sessionStorage.removeItem('fb_fpo_session');
  },

  // Buyer Session Management
  getBuyerSession() {
    try {
      const session = localStorage.getItem('fb_buyer_session') || sessionStorage.getItem('fb_buyer_session');
      return session ? JSON.parse(session) : null;
    } catch (e) {
      return null;
    }
  },

  setBuyerSession(buyerData) {
    sessionStorage.setItem('fb_buyer_session', JSON.stringify(buyerData));
    localStorage.setItem('fb_buyer_session', JSON.stringify(buyerData));
  },

  clearBuyerSession() {
    localStorage.removeItem('fb_buyer_session');
    sessionStorage.removeItem('fb_buyer_session');
  },

  // Driver Session Management
  getDriverSession() {
    try {
      const session = localStorage.getItem('farmbranch_driver') || localStorage.getItem('fb_driver_session');
      return session ? JSON.parse(session) : null;
    } catch (e) {
      return null;
    }
  },

  setDriverSession(driverData) {
    try {
      localStorage.setItem('farmbranch_driver', JSON.stringify(driverData));
    } catch (e) {
      console.error('Error saving driver session:', e);
    }
  },

  clearDriverSession() {
    try {
      localStorage.removeItem('farmbranch_driver');
      localStorage.removeItem('fb_driver_session');
    } catch (e) {
      console.error('Error clearing driver session:', e);
    }
  }
};
