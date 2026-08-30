/**
 * FarmBranch Logistics & Transporter / Driver Hub Logic
 */

let activeDriver = null;
let pollTimer = null;
let currentPendingDispatch = null;
let driverMap = null;
let driverMarker = null;

function getHandledOrders() {
  try {
    return JSON.parse(localStorage.getItem('fb_handled_orders') || '[]');
  } catch (e) {
    return [];
  }
}

function markOrderHandled(orderId) {
  if (!orderId) return;
  const handled = getHandledOrders();
  if (!handled.includes(orderId)) {
    handled.push(orderId);
    localStorage.setItem('fb_handled_orders', JSON.stringify(handled));
  }
}

function getActiveTransit() {
  try {
    return JSON.parse(localStorage.getItem('fb_active_transit') || 'null');
  } catch (e) {
    return null;
  }
}

function setActiveTransit(order) {
  if (order) {
    localStorage.setItem('fb_active_transit', JSON.stringify(order));
  } else {
    localStorage.removeItem('fb_active_transit');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initDriverAuthCheck();
  setupDriverEventHandlers();
});

// 1. Session & Auth Check
function initDriverAuthCheck() {
  let session = null;
  try {
    const raw = localStorage.getItem('farmbranch_driver');
    if (raw) {
      session = JSON.parse(raw);
    } else if (window.FB_AUTH && typeof FB_AUTH.getDriverSession === 'function') {
      session = FB_AUTH.getDriverSession();
    }
  } catch (e) {
    session = null;
  }

  const regSection = document.getElementById('driverRegisterSection');
  const dashSection = document.getElementById('driverDashboardSection');

  if (session && session.driver_id) {
    activeDriver = session;
    if (regSection) regSection.style.display = 'none';
    if (dashSection) dashSection.style.display = 'block';

    const nameEl = document.getElementById('displayDriverName');
    if (nameEl) nameEl.textContent = session.driver_name || 'Commercial Driver';

    const vehEl = document.getElementById('displayVehicleNumber');
    if (vehEl) vehEl.textContent = session.vehicle_number || '';

    const dlEl = document.getElementById('displayDlNumber');
    if (dlEl) dlEl.textContent = session.license_number || '';

    const typeEl = document.getElementById('displayVehicleType');
    if (typeEl) typeEl.textContent = `${session.vehicle_type || 'Commercial Vehicle'} (${session.capacity_quintals || 0} Qtl)`;

    const rateEl = document.getElementById('displayDriverRate');
    if (rateEl) rateEl.textContent = `₹${session.rate_per_km || 0}/km`;

    // Render stored active transit if present
    const savedTransit = getActiveTransit();
    if (savedTransit) {
      renderActiveTransitCard(savedTransit);
    }

    initDriverTrackingMap(session);
    startDispatchPolling(session.driver_id);
  } else {
    activeDriver = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (regSection) regSection.style.display = 'block';
    if (dashSection) dashSection.style.display = 'none';
  }
}

function setupDriverEventHandlers() {
  const formRegister = document.getElementById('formDriverRegister');
  const btnLogout = document.getElementById('btnDriverLogout');
  const btnAcceptTransit = document.getElementById('btnAcceptTransit');
  const btnDismissDispatch = document.getElementById('btnDismissDispatch');
  const modalAlert = document.getElementById('modalDispatchAlert');

  // Register Commercial Driver
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const driver_name = document.getElementById('regDriverName').value.trim();
      const phone = document.getElementById('regDriverPhone').value.trim();
      const license_number = document.getElementById('regDriverDl').value.trim();
      const vehicle_number = document.getElementById('regDriverRc').value.trim();
      const vehicle_type = document.getElementById('regVehicleType').value;
      const capacity_quintals = parseFloat(document.getElementById('regCapacity').value);
      const rate_per_km = parseFloat(document.getElementById('regRateKm').value);

      // Default coordinates (Tamil Nadu)
      const lat = 11.0100 + (Math.random() * 0.05);
      const lng = 76.9600 + (Math.random() * 0.05);

      const payload = {
        driver_name,
        phone,
        license_number,
        vehicle_number,
        vehicle_type,
        capacity_quintals,
        rate_per_km,
        latitude: parseFloat(lat.toFixed(4)),
        longitude: parseFloat(lng.toFixed(4))
      };

      try {
        const res = await fetch('/api/driver/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success' && data.driver) {
          localStorage.setItem('farmbranch_driver', JSON.stringify(data.driver));
          if (window.FB_AUTH && typeof FB_AUTH.setDriverSession === 'function') {
            FB_AUTH.setDriverSession(data.driver);
          }
          if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
            FB_AUTH.showToast('Commercial Driver Registration Verified by Ministry Transport Registry!', 'success');
          }
          initDriverAuthCheck();
        } else {
          if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
            FB_AUTH.showToast(data.message || 'Registration failed', 'error');
          }
        }
      } catch (err) {
        if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
          FB_AUTH.showToast('Connection error during driver registration.', 'error');
        }
      }
    });
  }

  // Driver Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      localStorage.removeItem('farmbranch_driver');
      localStorage.removeItem('fb_active_transit');
      if (window.FB_AUTH && typeof FB_AUTH.clearDriverSession === 'function') {
        FB_AUTH.clearDriverSession();
      }
      activeDriver = null;

      const regSection = document.getElementById('driverRegisterSection');
      const dashSection = document.getElementById('driverDashboardSection');
      if (regSection) regSection.style.display = 'block';
      if (dashSection) dashSection.style.display = 'none';

      const transitContainer = document.getElementById('activeTransitContainer');
      if (transitContainer) transitContainer.innerHTML = '';

      if (modalAlert) modalAlert.classList.remove('active');

      if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
        FB_AUTH.showToast('Transporter logged out successfully.', 'info');
      }
    });
  }

  // Accept Transit
  if (btnAcceptTransit) {
    btnAcceptTransit.addEventListener('click', () => {
      acceptDispatchedTransit();
    });
  }

  // Dismiss Dispatch Modal
  if (btnDismissDispatch) {
    btnDismissDispatch.addEventListener('click', () => {
      if (currentPendingDispatch && currentPendingDispatch.order_id) {
        markOrderHandled(currentPendingDispatch.order_id);
      }
      if (modalAlert) modalAlert.classList.remove('active');
    });
  }

  // Also dismiss when clicking modal backdrop
  if (modalAlert) {
    modalAlert.addEventListener('click', (e) => {
      if (e.target === modalAlert) {
        if (currentPendingDispatch && currentPendingDispatch.order_id) {
          markOrderHandled(currentPendingDispatch.order_id);
        }
        modalAlert.classList.remove('active');
      }
    });
  }
}

// 2. Transporter Map View
function initDriverTrackingMap(driver) {
  const mapContainer = document.getElementById('driverLiveMap');
  if (!mapContainer || typeof L === 'undefined') return;

  const lat = driver.latitude || 11.0100;
  const lng = driver.longitude || 76.9600;

  if (!driverMap) {
    driverMap = L.map('driverLiveMap').setView([lat, lng], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap | FarmBranch National Logistics Grid'
    }).addTo(driverMap);
  } else {
    driverMap.setView([lat, lng], 11);
    setTimeout(() => {
      driverMap.invalidateSize();
    }, 100);
  }

  const truckIcon = L.divIcon({
    className: 'custom-truck-pin',
    html: `<div style="background-color: #ea580c; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 17px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">🚚</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  if (driverMarker) {
    driverMap.removeLayer(driverMarker);
  }

  driverMarker = L.marker([lat, lng], { icon: truckIcon }).addTo(driverMap);
  driverMarker.bindPopup(`
    <div class="map-popup-card">
      <span class="badge badge-available">ACTIVE TRANSPORTER</span>
      <h4 style="margin-top:4px;">${driver.driver_name || 'Driver'}</h4>
      <p><strong>Vehicle:</strong> ${driver.vehicle_number || 'N/A'} (${driver.vehicle_type || 'Commercial'})</p>
      <p><strong>Status:</strong> ${driver.status || 'Available'}</p>
    </div>
  `).openPopup();
}

// 3. Automated Dispatch Notifications Polling (Controlled Loop)
function startDispatchPolling(driverId) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const dashSection = document.getElementById('driverDashboardSection');
  if (!dashSection || dashSection.style.display === 'none') {
    return;
  }

  checkForDispatches(driverId);

  pollTimer = setInterval(() => {
    const dash = document.getElementById('driverDashboardSection');
    if (!dash || dash.style.display === 'none' || !activeDriver || activeDriver.driver_id !== driverId) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      return;
    }
    checkForDispatches(driverId);
  }, 6000);
}

async function checkForDispatches(driverId) {
  const dashSection = document.getElementById('driverDashboardSection');
  if (!dashSection || dashSection.style.display === 'none' || !activeDriver) {
    return;
  }

  try {
    const res = await fetch(`/api/driver/notifications/${driverId}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === 'success') {
      // Check if there is an active transit assigned to this driver
      if (data.active_transit) {
        setActiveTransit(data.active_transit);
        renderActiveTransitCard(data.active_transit);
      }

      // Check for incoming pickup dispatches
      const dispatchOrder = data.order || data.pending_order;
      if (data.has_dispatch && dispatchOrder) {
        const handled = getHandledOrders();
        const activeTransit = getActiveTransit();

        // Only display modal if order is not handled and not currently in active transit
        if (!handled.includes(dispatchOrder.order_id) && (!activeTransit || activeTransit.order_id !== dispatchOrder.order_id)) {
          currentPendingDispatch = dispatchOrder;
          showDispatchAlertModal(dispatchOrder);
        }
      }
    }
  } catch (err) {
    console.error('Dispatch polling error:', err);
  }
}

function showDispatchAlertModal(order) {
  const modal = document.getElementById('modalDispatchAlert');
  if (!modal) return;

  const farmerLoc = document.getElementById('dispatchFarmerLoc');
  if (farmerLoc) farmerLoc.textContent = `${order.farmer_name ? order.farmer_name + ' - ' : ''}${order.farmer_location || 'Coimbatore Rural'}`;

  const buyerLoc = document.getElementById('dispatchBuyerLoc');
  if (buyerLoc) buyerLoc.textContent = `${order.buyer_name ? order.buyer_name + ' - ' : ''}${order.buyer_location || 'APMC Central Mandi'}`;

  const cropDetails = document.getElementById('dispatchCropDetails');
  if (cropDetails) cropDetails.textContent = `${order.crop_type} (${order.quantity_quintals} Quintals)`;

  const freightCost = document.getElementById('dispatchFreightCost');
  if (freightCost) freightCost.textContent = `₹${order.transport_cost ? order.transport_cost.toLocaleString() : '1,200'}`;

  const dist = document.getElementById('dispatchDistance');
  if (dist) dist.textContent = `${order.transport_distance_km || '35.0'} KM`;

  modal.classList.add('active');
}

async function acceptDispatchedTransit() {
  if (!currentPendingDispatch || !activeDriver) return;

  const orderToAccept = currentPendingDispatch;
  markOrderHandled(orderToAccept.order_id);

  try {
    const res = await fetch('/api/driver/accept-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderToAccept.order_id,
        driver_id: activeDriver.driver_id
      })
    });
    const data = await res.json();

    const modal = document.getElementById('modalDispatchAlert');
    if (modal) modal.classList.remove('active');

    if (data.status === 'success') {
      const acceptedOrder = data.order || orderToAccept;
      setActiveTransit(acceptedOrder);
      if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
        FB_AUTH.showToast('Transit Order Locked! GPS Route transmitted to vehicle.', 'success', 6000);
      }
      renderActiveTransitCard(acceptedOrder);
    } else {
      if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
        FB_AUTH.showToast(data.message || 'Failed to lock transit', 'error');
      }
    }
  } catch (err) {
    if (window.FB_AUTH && typeof FB_AUTH.showToast === 'function') {
      FB_AUTH.showToast('Error accepting transit.', 'error');
    }
  }
}

function renderActiveTransitCard(order) {
  const container = document.getElementById('activeTransitContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="card-panel" style="background: linear-gradient(135deg, #ecfdf5, #f0fdf4); border: 2px solid #34d399; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.12);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 14px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="badge badge-approved" style="background:#059669; color:#fff; font-weight:700;">🟢 ACTIVE TRANSIT IN PROGRESS</span>
            <span class="badge badge-agristack">AgriStack GPS Telematics Active</span>
          </div>
          <h3 style="color:#065f46; font-size:1.3rem; font-weight:800; margin: 4px 0;">Waybill #${order.order_id}: ${order.crop_type} (${order.quantity_quintals} Quintals)</h3>
          <div style="font-size:0.92rem; color:#047857; line-height: 1.6; margin-top: 4px;">
            <p>📍 <strong>Pickup (Farmer):</strong> ${order.farmer_name || 'Farmer'} - ${order.farmer_location || 'Tamil Nadu'} ${order.farmer_phone ? `(📞 ${order.farmer_phone})` : ''}</p>
            <p>🏢 <strong>Drop-off (Buyer Hub):</strong> ${order.buyer_name || 'Mandi Hub'} - ${order.buyer_location || 'APMC Market'} ${order.buyer_phone ? `(📞 ${order.buyer_phone})` : ''}</p>
          </div>
        </div>
        <div style="text-align:right; min-width: 180px;">
          <div style="font-size:0.85rem; color:#065f46; text-transform:uppercase; font-weight:700;">Guaranteed Freight Pay</div>
          <div style="font-size:1.5rem; font-weight:900; color:#047857;">₹${order.transport_cost ? order.transport_cost.toLocaleString() : '1,200'}</div>
          <p style="font-size:0.82rem; color:#059669; margin-top:2px;">Estimated Distance: <strong>${order.transport_distance_km || '25.0'} KM</strong></p>
        </div>
      </div>
    </div>
  `;
}
