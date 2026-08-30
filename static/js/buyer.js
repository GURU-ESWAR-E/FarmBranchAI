/**
 * FarmBranch Buyer & Mandi Trader Module Logic
 */

let buyerMap = null;
let buyerFarmerMarkers = [];
let activeBuyerData = null;
let selectedFarmerForTrade = null;
let currentPendingOrderId = null;
let buyerRoutePolyline = null;
let currentProposalDistance = 25.0;

const BUYER_VEHICLE_CONFIGS = {
  'Mini Car / Pickup': { base: 250, rate: 12 },
  'Minivan / Tata Ace': { base: 400, rate: 18 },
  'Commercial Truck (10-Wheeler / Eicher)': { base: 1000, rate: 35 }
};

document.addEventListener('DOMContentLoaded', () => {
  initBuyerAuthCheck();
  setupBuyerEventHandlers();
});

// 1. Auth and Session Check
function initBuyerAuthCheck() {
  const session = FB_AUTH.getBuyerSession();
  const authSection = document.getElementById('buyerAuthSection');
  const terminalSection = document.getElementById('buyerTerminalSection');

  if (session && session.buyer_id) {
    activeBuyerData = session;
    if (authSection) authSection.style.display = 'none';
    if (terminalSection) terminalSection.style.display = 'block';

    document.getElementById('displayBuyerName').textContent = session.name;
    document.getElementById('displayBuyerLicense').textContent = session.unique_license_id;
    document.getElementById('displayBuyerLoc').textContent = session.location;
    document.getElementById('displayBuyerBid').textContent = `₹${session.buyer_max_bid ? session.buyer_max_bid.toLocaleString() : '3,000'}/qtl`;

    loadBuyerMarketData();
  } else {
    if (authSection) authSection.style.display = 'block';
    if (terminalSection) terminalSection.style.display = 'none';
  }
}

function setupBuyerEventHandlers() {
  const formSendOtp = document.getElementById('formBuyerLogin');
  const formVerifyOtp = document.getElementById('formVerifyOtp');
  const modalOtp = document.getElementById('modalBuyerOtp');

  // Step 1: Send OTP
  if (formSendOtp) {
    formSendOtp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const license_id = document.getElementById('inputBuyerLicense').value.trim();
      const name = document.getElementById('inputBuyerName').value.trim();
      const phone = document.getElementById('inputBuyerPhone').value.trim();

      try {
        const res = await fetch('/api/buyer/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_id, name, phone })
        });
        const data = await res.json();

        if (data.status === 'success') {
          FB_AUTH.showToast(`Official OTP dispatched: [ ${data.otp} ]`, 'info', 10000);
          if (modalOtp) modalOtp.classList.add('active');
          document.getElementById('otpBuyerLicenseRef').value = data.license_id || license_id;
        } else {
          FB_AUTH.showToast(data.message || 'OTP generation failed', 'error');
        }
      } catch (err) {
        FB_AUTH.showToast('Failed to contact authentication server.', 'error');
      }
    });
  }

  // Step 2: Verify OTP
  if (formVerifyOtp) {
    formVerifyOtp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const license_id = document.getElementById('otpBuyerLicenseRef').value;
      const otp = document.getElementById('inputOtpCode').value.trim();

      try {
        const res = await fetch('/api/buyer/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_id, otp })
        });
        const data = await res.json();

        if (data.status === 'success') {
          FB_AUTH.setBuyerSession(data.buyer);
          FB_AUTH.showToast('2-Step OTP Authentication Verified! Welcome to Mandi Terminal.', 'success');
          if (modalOtp) modalOtp.classList.remove('active');
          initBuyerAuthCheck();
        } else {
          FB_AUTH.showToast(data.message || 'Invalid OTP code', 'error');
        }
      } catch (err) {
        FB_AUTH.showToast('OTP verification failed.', 'error');
      }
    });
  }

  // Buyer Logout
  const btnLogout = document.getElementById('btnBuyerLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      FB_AUTH.clearBuyerSession();
      window.location.reload();
    });
  }

  // Trade Proposal Modal Close
  const closeTradeModal = document.getElementById('btnCloseTradeModal');
  const modalTrade = document.getElementById('modalTradeProposal');
  if (closeTradeModal && modalTrade) {
    closeTradeModal.addEventListener('click', () => {
      modalTrade.classList.remove('active');
    });
  }

  // Submit Trade Proposal
  const btnConfirmSendProposal = document.getElementById('btnConfirmSendProposal');
  if (btnConfirmSendProposal) {
    btnConfirmSendProposal.addEventListener('click', () => {
      submitTradeProposal();
    });
  }

  // SMS Simulation Buttons
  const btnSimAccept = document.getElementById('btnSimulateFarmerAccept');
  const btnSimReject = document.getElementById('btnSimulateFarmerReject');

  if (btnSimAccept) {
    btnSimAccept.addEventListener('click', () => {
      respondToTradeProposal('Approved');
    });
  }

  if (btnSimReject) {
    btnSimReject.addEventListener('click', () => {
      respondToTradeProposal('Rejected');
    });
  }
}

// 2. Load Discovery Data and Map
async function loadBuyerMarketData() {
  try {
    const res = await fetch('/api/market/all-pins');
    const data = await res.json();

    if (data.status === 'success') {
      const farmers = data.farmers || [];
      initBuyerMap(farmers, activeBuyerData);
      renderNearbyFarmersList(farmers, activeBuyerData);
    }
  } catch (err) {
    console.error('Error loading market data:', err);
  }
}

function initBuyerMap(farmers, buyer) {
  const buyerLat = buyer.latitude || 11.0064;
  const buyerLng = buyer.longitude || 76.9530;

  if (!buyerMap) {
    buyerMap = L.map('buyerDiscoveryMap').setView([buyerLat, buyerLng], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors | FarmBranch Mandi Grid'
    }).addTo(buyerMap);
  } else {
    buyerMap.setView([buyerLat, buyerLng], 9);
  }

  buyerFarmerMarkers.forEach(m => buyerMap.removeLayer(m));
  buyerFarmerMarkers = [];

  const warehouseIcon = L.divIcon({
    className: 'custom-warehouse-pin',
    html: `<div style="background-color: #1d4ed8; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid #fbbf24; box-shadow: 0 0 10px rgba(29, 78, 216, 0.6);">🏢</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  const buyerMarker = L.marker([buyerLat, buyerLng], { icon: warehouseIcon }).addTo(buyerMap);
  buyerMarker.bindPopup(`
    <div class="map-popup-card">
      <span class="badge badge-approved">YOUR MANDI WAREHOUSE</span>
      <h4 style="margin-top:4px;">${buyer.name}</h4>
      <p>📍 ${buyer.location}</p>
      <p><strong>Max Buying Bid:</strong> ₹${buyer.buyer_max_bid}/qtl</p>
    </div>
  `).openPopup();

  // Proximity Rings
  L.circle([buyerLat, buyerLng], {
    radius: 30000,
    color: '#3b82f6',
    fillColor: '#60a5fa',
    fillOpacity: 0.06,
    weight: 1
  }).addTo(buyerMap);

  const farmerIcon = L.divIcon({
    className: 'custom-farmer-pin',
    html: `<div style="background-color: #047857; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🌾</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  farmers.forEach(f => {
    const marker = L.marker([f.latitude, f.longitude], { icon: farmerIcon }).addTo(buyerMap);
    
    let bidComparisonHtml = '';
    if (buyer.buyer_max_bid >= f.expected_price) {
      bidComparisonHtml = `<span style="color:#047857; font-weight:700;">🟢 Bid Match (Within Budget)</span>`;
    } else {
      bidComparisonHtml = `<span style="color:#dc2626; font-weight:700;">🔴 Farmer Expected Exceeds Bid</span>`;
    }

    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="badge badge-agristack">AgriStack Verified</span>
        <h4 style="margin-top:4px;">${f.name}</h4>
        <div class="popup-sub">📍 ${f.location} | 📞 ${f.phone}</div>
        <p><strong>Crop:</strong> ${f.crop_type} (${f.quantity_quintals} Qtl)</p>
        <div class="map-price-matrix">
          <div class="map-price-row">
            <span>Farmer Expected:</span>
            <span class="price-val">₹${f.expected_price}/qtl</span>
          </div>
          <div class="map-price-row">
            <span>Max Cap:</span>
            <span class="price-val">₹${f.max_sellable_price}/qtl</span>
          </div>
          <div class="map-price-row">
            <span>Your Bid Limit:</span>
            <span class="price-val" style="color:#1d4ed8;">₹${buyer.buyer_max_bid}/qtl</span>
          </div>
          <div style="margin-top: 6px; font-size: 0.78rem;">${bidComparisonHtml}</div>
        </div>
        <button class="btn btn-sm btn-primary" style="width:100%" onclick="openTradeProposalModal('${f.farmer_id}')">Send Trade Proposal & Route</button>
      </div>
    `);
    buyerFarmerMarkers.push(marker);
  });
}

function renderNearbyFarmersList(farmers, buyer) {
  const container = document.getElementById('nearbyFarmersList');
  if (!container) return;

  container.innerHTML = farmers.map(f => {
    const matchStatus = (buyer.buyer_max_bid >= f.expected_price) 
      ? '<span class="badge badge-approved">✓ Direct Price Match</span>' 
      : '<span class="badge badge-pending">Negotiation Required</span>';

    return `
      <div class="card-panel" style="margin-bottom: 14px; padding: 18px; border-left: 4px solid ${buyer.buyer_max_bid >= f.expected_price ? '#16a34a' : '#d97706'};">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap: 8px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h4 style="font-size:1.1rem; color:var(--navy);">${f.name}</h4>
              <span class="badge badge-agristack">${f.farmer_id}</span>
              ${matchStatus}
            </div>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">📍 ${f.location} | 📞 ${f.phone}</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.15rem; font-weight:800; color:#047857;">₹${f.expected_price.toLocaleString()}/qtl</div>
            <small style="color:var(--text-muted);">Available: <strong>${f.quantity_quintals} Quintals</strong></small>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color); flex-wrap:wrap; gap: 10px;">
          <div style="font-size:0.85rem;">
            <strong>Crop:</strong> ${f.crop_type} | <strong>Max Ceiling:</strong> ₹${f.max_sellable_price}/qtl
          </div>
          <button class="btn btn-sm btn-primary" onclick="openTradeProposalModal('${f.farmer_id}')">
            🤝 Send Trade Proposal & Route
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 3. Trade Proposal & SMS Simulation
window.openTradeProposalModal = function(farmerId) {
  fetch(`/api/market/all-pins`)
    .then(r => r.json())
    .then(data => {
      const f = (data.farmers || []).find(item => item.farmer_id === farmerId);
      if (f) {
        selectedFarmerForTrade = f;
        document.getElementById('tradeFarmerName').textContent = f.name;
        document.getElementById('tradeFarmerCrop').textContent = `${f.crop_type} (${f.quantity_quintals} Qtl)`;
        document.getElementById('tradeFarmerLoc').textContent = f.location;
        document.getElementById('tradeOfferPrice').value = Math.min(activeBuyerData.buyer_max_bid || 3000, f.max_sellable_price);
        document.getElementById('tradeOfferQty').value = f.quantity_quintals;

        // Draw route on buyer discovery map
        drawBuyerRoute(f, activeBuyerData);

        updateBuyerProposalEstimate();
        document.getElementById('modalTradeProposal').classList.add('active');
      }
    });
};

window.updateBuyerProposalEstimate = function() {
  if (!selectedFarmerForTrade) return;

  const price = parseFloat(document.getElementById('tradeOfferPrice').value) || 0;
  const qty = parseFloat(document.getElementById('tradeOfferQty').value) || 0;
  const vTier = document.getElementById('tradeVehicleType')?.value || 'Minivan / Tata Ace';

  const vConf = BUYER_VEHICLE_CONFIGS[vTier] || BUYER_VEHICLE_CONFIGS['Minivan / Tata Ace'];
  const baseFare = vConf.base;
  const mileageFare = currentProposalDistance * vConf.rate;
  const handlingSurcharge = qty * 5;
  const totalFreight = Math.round(baseFare + mileageFare + handlingSurcharge);
  const cropTotal = Math.round(price * qty);
  const grandTotal = cropTotal + totalFreight;

  document.getElementById('dispProposalFreight').textContent = `₹${totalFreight.toLocaleString()}`;
  document.getElementById('dispProposalGrandTotal').textContent = `₹${grandTotal.toLocaleString()} (Crop ₹${cropTotal.toLocaleString()} + Freight ₹${totalFreight.toLocaleString()})`;
};

async function drawBuyerRoute(farmer, buyer) {
  const statusEl = document.getElementById('buyerRouteStatus');
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${farmer.longitude},${farmer.latitude};${buyer.longitude},${buyer.latitude}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(osrmUrl);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      currentProposalDistance = parseFloat((route.distance / 1000).toFixed(2));
      const mins = Math.round(route.duration / 60);

      if (statusEl) statusEl.innerHTML = `🟢 OSRM Road Distance: <strong>${currentProposalDistance} KM</strong> (${mins} mins)`;
      if (buyerRoutePolyline) buyerMap.removeLayer(buyerRoutePolyline);
      buyerRoutePolyline = L.geoJSON(route.geometry, { style: { color: '#16a34a', weight: 5 } }).addTo(buyerMap);
      buyerMap.fitBounds(buyerRoutePolyline.getBounds(), { padding: [50, 50] });
      return;
    }
  } catch (e) {
    console.warn('Buyer OSRM route error:', e);
  }

  // Fallback
  currentProposalDistance = 28.5;
  if (buyerRoutePolyline) buyerMap.removeLayer(buyerRoutePolyline);
  buyerRoutePolyline = L.polyline([[farmer.latitude, farmer.longitude], [buyer.latitude, buyer.longitude]], {
    color: '#16a34a', weight: 4, dashArray: '6, 8'
  }).addTo(buyerMap);
  buyerMap.fitBounds(buyerRoutePolyline.getBounds(), { padding: [50, 50] });
}

async function submitTradeProposal() {
  if (!selectedFarmerForTrade || !activeBuyerData) return;

  const offeredPrice = parseFloat(document.getElementById('tradeOfferPrice').value);
  const offeredQty = parseFloat(document.getElementById('tradeOfferQty').value);
  const vehicleType = document.getElementById('tradeVehicleType').value;

  if (isNaN(offeredPrice) || isNaN(offeredQty) || offeredPrice <= 0 || offeredQty <= 0) {
    FB_AUTH.showToast('Please enter a valid offered price and quantity.', 'warning');
    return;
  }

  const payload = {
    farmer_id: selectedFarmerForTrade.farmer_id,
    buyer_id: activeBuyerData.buyer_id,
    crop_type: selectedFarmerForTrade.crop_type,
    quantity_quintals: offeredQty,
    agreed_price_per_qtl: offeredPrice,
    vehicle_type: vehicleType,
    distance_km: currentProposalDistance
  };

  try {
    const res = await fetch('/api/buyer/proposal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'success') {
      currentPendingOrderId = data.order_id;
      document.getElementById('modalTradeProposal').classList.remove('active');

      // Open AgriStack SMS Simulation Modal
      document.getElementById('smsFarmerName').textContent = selectedFarmerForTrade.name;
      document.getElementById('smsFarmerPhone').textContent = selectedFarmerForTrade.phone;
      document.getElementById('smsBuyerName').textContent = activeBuyerData.name;
      document.getElementById('smsTradeDetails').textContent = `${offeredQty} Qtl of ${selectedFarmerForTrade.crop_type} @ ₹${offeredPrice}/qtl | Freight: ₹${data.transport_cost.toLocaleString()} | Grand Total: ₹${data.grand_total.toLocaleString()}`;
      
      document.getElementById('modalFarmerSms').classList.add('active');
      FB_AUTH.showToast('Trade proposal transmitted! Simulating Farmer AgriStack SMS...', 'info');
    } else {
      FB_AUTH.showToast(data.message || 'Proposal failed', 'error');
    }
  } catch (err) {
    FB_AUTH.showToast('Error sending proposal.', 'error');
  }
}

async function respondToTradeProposal(status) {
  if (!currentPendingOrderId) return;

  try {
    const res = await fetch('/api/farmer/respond-proposal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: currentPendingOrderId, status })
    });
    const data = await res.json();

    document.getElementById('modalFarmerSms').classList.remove('active');

    if (status === 'Approved') {
      FB_AUTH.showToast('Farmer ACCEPTED the trade proposal! Order confirmed & dispatched to Logistics Grid.', 'success', 6000);
      showOrderSuccessBanner(data.order);
    } else {
      FB_AUTH.showToast('Farmer DECLINED the trade proposal. Workflow halted.', 'warning', 5000);
    }
  } catch (err) {
    FB_AUTH.showToast('Error recording response.', 'error');
  }
}

function showOrderSuccessBanner(order) {
  const banner = document.getElementById('orderConfirmationBanner');
  if (banner) {
    banner.style.display = 'block';
    banner.innerHTML = `
      <div class="card-panel" style="background:#f0fdf4; border: 2px solid #86efac;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <span style="font-size: 2rem;">🎉</span>
          <div>
            <h4 style="color:#15803d; font-size:1.15rem;">Trade Order Confirmed & Transport Dispatched!</h4>
            <p style="font-size:0.88rem; color:#166534;">Order #${order.order_id} (${order.crop_type} - ${order.quantity_quintals} Qtl) has been locked. Total Freight: ₹${order.transport_cost.toLocaleString()} | Grand Total: ₹${order.grand_total.toLocaleString()}. An available commercial transporter in the area has been dispatched.</p>
          </div>
        </div>
      </div>
    `;
    banner.scrollIntoView({ behavior: 'smooth' });
  }
}
