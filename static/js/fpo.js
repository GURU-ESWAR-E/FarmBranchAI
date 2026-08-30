/**
 * FarmBranch FPO Module & Dashboard Logic
 */

let fpoMap = null;
let farmerMarkers = [];
let buyerMarkers = [];
let routePolyline = null;
let currentFarmers = [];
let currentBuyers = [];
let stagedFarmerData = null;
let lastCalculatedRoadDistance = 25.0;

document.addEventListener('DOMContentLoaded', () => {
  initFpoAuthCheck();
  setupFpoEventHandlers();
});

// 1. Session and Auth Check
function initFpoAuthCheck() {
  const session = FB_AUTH.getFpoSession() || JSON.parse(sessionStorage.getItem('fb_fpo_session') || 'null');
  const authSection = document.getElementById('fpoAuthSection');
  const hubSection = document.getElementById('fpoHubSection');

  if (session && session.fpo_id) {
    if (authSection) authSection.style.display = 'none';
    if (hubSection) hubSection.style.display = 'block';
    
    document.getElementById('displayFpoName').textContent = session.name || session.fpo_id;
    document.getElementById('displayFpoId').textContent = session.fpo_id;
    document.getElementById('displayFpoLocation').textContent = session.location || 'Tamil Nadu';
    
    loadFpoData(session.fpo_id);
  } else {
    if (authSection) authSection.style.display = 'block';
    if (hubSection) hubSection.style.display = 'none';
  }
}

function setupFpoEventHandlers() {
  // Login Tab Toggle
  const loginTab = document.getElementById('tabFpoLogin');
  const registerTab = document.getElementById('tabFpoRegister');
  const loginForm = document.getElementById('formFpoLogin');
  const registerForm = document.getElementById('formFpoRegister');

  if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    });

    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerForm.style.display = 'block';
      loginForm.style.display = 'none';
    });
  }

  // FPO Login Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fpo_id = document.getElementById('loginFpoId').value.trim();
      const password = document.getElementById('loginFpoPassword').value;
      const remember = document.getElementById('rememberFpo').checked;

      try {
        const res = await fetch('/api/fpo/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fpo_id, password })
        });
        const data = await res.json();

        if (data.status === 'success') {
          FB_AUTH.setFpoSession(data.fpo, remember);
          FB_AUTH.showToast('Login successful! Welcome to FPO Hub.', 'success');
          initFpoAuthCheck();
        } else {
          FB_AUTH.showToast(data.message || 'Invalid Credentials', 'error');
        }
      } catch (err) {
        FB_AUTH.showToast('Server connection failed.', 'error');
      }
    });
  }

  // FPO Register Submit
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fpo_id = document.getElementById('regFpoId').value.trim();
      const name = document.getElementById('regFpoName').value.trim();
      const location = document.getElementById('regFpoLocation').value.trim();
      const password = document.getElementById('regFpoPassword').value;

      try {
        const res = await fetch('/api/fpo/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fpo_id, name, location, password })
        });
        const data = await res.json();

        if (data.status === 'success') {
          FB_AUTH.setFpoSession(data.fpo, true);
          FB_AUTH.showToast('FPO Registered & Authenticated Successfully!', 'success');
          initFpoAuthCheck();
        } else {
          FB_AUTH.showToast(data.message || 'Registration failed', 'error');
        }
      } catch (err) {
        FB_AUTH.showToast('Server connection failed.', 'error');
      }
    });
  }

  // FPO Logout
  const logoutBtn = document.getElementById('btnFpoLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      FB_AUTH.clearFpoSession();
      window.location.reload();
    });
  }

  // AgriStack Modal Trigger
  const btnOpenAddFarmer = document.getElementById('btnOpenAddFarmerModal');
  const modalAddFarmer = document.getElementById('modalAddFarmer');
  const closeFarmerModal = document.getElementById('btnCloseFarmerModal');

  if (btnOpenAddFarmer && modalAddFarmer) {
    btnOpenAddFarmer.addEventListener('click', () => {
      resetFarmerForm();
      modalAddFarmer.classList.add('active');
    });
  }

  if (closeFarmerModal && modalAddFarmer) {
    closeFarmerModal.addEventListener('click', () => {
      modalAddFarmer.classList.remove('active');
    });
  }

  // AgriStack Verification Button
  const btnVerifyAgriStack = document.getElementById('btnVerifyAgriStack');
  if (btnVerifyAgriStack) {
    btnVerifyAgriStack.addEventListener('click', () => {
      validateAndSimulateAgriStack();
    });
  }

  // Confirm and Add Farmer to DB
  const btnCommitFarmer = document.getElementById('btnCommitFarmer');
  if (btnCommitFarmer) {
    btnCommitFarmer.addEventListener('click', () => {
      commitFarmerToDb();
    });
  }

  // Calculate Bill Button
  const btnCalcBill = document.getElementById('btnCalculateBill');
  if (btnCalcBill) {
    btnCalcBill.addEventListener('click', () => {
      calculateFreightAndGenerateBill();
    });
  }
}

// 2. Load Data for Dashboard
async function loadFpoData(fpoId) {
  try {
    const res = await fetch(`/api/market/all-pins?fpo_id=${encodeURIComponent(fpoId)}`);
    const data = await res.json();

    if (data.status === 'success') {
      currentFarmers = data.farmers || [];
      currentBuyers = data.buyers || [];
      
      renderFarmerTable(currentFarmers);
      populateRoutingDropdowns(currentFarmers, currentBuyers);
      initOrUpdateMap(currentFarmers, currentBuyers);
    }
  } catch (err) {
    console.error('Failed to load FPO data:', err);
  }
}

function renderFarmerTable(farmers) {
  const tbody = document.getElementById('farmerTableBody');
  if (!tbody) return;

  if (farmers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-muted); padding: 24px;">No registered farmers found. Click "+ Register AgriStack Farmer" to onboard.</td></tr>`;
    return;
  }

  tbody.innerHTML = farmers.map(f => `
    <tr>
      <td><span class="badge badge-agristack">${f.farmer_id}</span></td>
      <td><strong>${f.name}</strong><br><small style="color:var(--text-muted)">${f.phone}</small></td>
      <td>${f.location}</td>
      <td><strong>${f.crop_type}</strong></td>
      <td>${f.quantity_quintals} Qtl</td>
      <td style="color: #047857; font-weight:700;">₹${f.expected_price.toLocaleString()}</td>
      <td style="color: #1d4ed8; font-weight:700;">₹${f.max_sellable_price.toLocaleString()}</td>
      <td><span class="badge badge-approved">✓ ${f.verified_status}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="focusFarmerOnMap(${f.latitude}, ${f.longitude}, '${f.name}')">📍 Map</button>
      </td>
    </tr>
  `).join('');
}

function populateRoutingDropdowns(farmers, buyers) {
  const farmerSelect = document.getElementById('routeFarmerSelect');
  const buyerSelect = document.getElementById('routeBuyerSelect');

  if (farmerSelect) {
    farmerSelect.innerHTML = `<option value="">-- Choose Source Farmer --</option>` +
      farmers.map(f => `<option value="${f.farmer_id}">${f.name} (${f.crop_type} - ${f.quantity_quintals} Qtl @ ${f.location})</option>`).join('');
  }

  if (buyerSelect) {
    buyerSelect.innerHTML = `<option value="">-- Choose Destination Buyer / Mandi --</option>` +
      buyers.map(b => `<option value="${b.buyer_id}">${b.name} (${b.location} | Max Bid: ₹${b.buyer_max_bid})</option>`).join('');
  }
}

// 3. Leaflet Map Initialization & Rendering
function initOrUpdateMap(farmers, buyers) {
  if (!fpoMap) {
    fpoMap = L.map('fpoMap').setView([10.8505, 78.7047], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors | FarmBranch National Grid'
    }).addTo(fpoMap);
  }

  farmerMarkers.forEach(m => fpoMap.removeLayer(m));
  buyerMarkers.forEach(m => fpoMap.removeLayer(m));
  farmerMarkers = [];
  buyerMarkers = [];

  const farmerIcon = L.divIcon({
    className: 'custom-farmer-pin',
    html: `<div style="background-color: #047857; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🌾</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  const buyerIcon = L.divIcon({
    className: 'custom-buyer-pin',
    html: `<div style="background-color: #1d4ed8; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🏢</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  farmers.forEach(f => {
    const marker = L.marker([f.latitude, f.longitude], { icon: farmerIcon }).addTo(fpoMap);
    const apmcModalRate = Math.round((f.expected_price + f.max_sellable_price) / 2);

    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="badge badge-agristack">AgriStack ID: ${f.farmer_id}</span>
        <h4 style="margin-top: 6px;">${f.name}</h4>
        <div class="popup-sub">📍 ${f.location} | 📞 ${f.phone}</div>
        <p><strong>Crop:</strong> ${f.crop_type} (${f.quantity_quintals} Quintals)</p>
        <div class="map-price-matrix">
          <div class="map-price-row">
            <span>Farmer Expected Price:</span>
            <span class="price-val" style="color:#047857;">₹${f.expected_price}/qtl</span>
          </div>
          <div class="map-price-row">
            <span>Max Sellable Limit:</span>
            <span class="price-val" style="color:#1d4ed8;">₹${f.max_sellable_price}/qtl</span>
          </div>
          <div class="map-price-row">
            <span>APMC Modal Benchmark:</span>
            <span class="price-val" style="color:#d97706;">₹${apmcModalRate}/qtl</span>
          </div>
        </div>
        <button class="btn btn-sm btn-primary" style="width:100%" onclick="selectSourceFarmer('${f.farmer_id}')">Select for Routing</button>
      </div>
    `);
    farmerMarkers.push(marker);
  });

  buyers.forEach(b => {
    const marker = L.marker([b.latitude, b.longitude], { icon: buyerIcon }).addTo(fpoMap);
    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="badge badge-approved">Mandi License: ${b.unique_license_id}</span>
        <h4 style="margin-top: 6px;">${b.name}</h4>
        <div class="popup-sub">📍 ${b.location} | 📞 ${b.phone}</div>
        <p><strong>Demand:</strong> ${b.crop_demanded}</p>
        <div class="map-price-matrix">
          <div class="map-price-row">
            <span>Buyer's Max Buying Bid:</span>
            <span class="price-val" style="color:#1d4ed8;">₹${b.buyer_max_bid}/qtl</span>
          </div>
        </div>
        <button class="btn btn-sm btn-navy" style="width:100%" onclick="selectDestBuyer(${b.buyer_id})">Select as Mandi Hub</button>
      </div>
    `);
    buyerMarkers.push(marker);
  });
}

function focusFarmerOnMap(lat, lng, name) {
  if (fpoMap) {
    fpoMap.setView([lat, lng], 13);
    FB_AUTH.showToast(`Centered on farmer: ${name}`, 'info');
  }
}

window.selectSourceFarmer = function(farmerId) {
  const sel = document.getElementById('routeFarmerSelect');
  if (sel) sel.value = farmerId;
  FB_AUTH.showToast(`Farmer selected as pickup point.`, 'success');
  checkAndTriggerRoadRouting();
};

window.selectDestBuyer = function(buyerId) {
  const sel = document.getElementById('routeBuyerSelect');
  if (sel) sel.value = buyerId;
  FB_AUTH.showToast(`Buyer selected as drop-off hub.`, 'success');
  checkAndTriggerRoadRouting();
};

function checkAndTriggerRoadRouting() {
  const farmerId = document.getElementById('routeFarmerSelect')?.value;
  const buyerId = document.getElementById('routeBuyerSelect')?.value;

  if (farmerId && buyerId) {
    const farmer = currentFarmers.find(f => f.farmer_id === farmerId);
    const buyer = currentBuyers.find(b => b.buyer_id == buyerId);
    if (farmer && buyer) {
      drawOSRMRoute(farmer, buyer);
    }
  }
}

async function drawOSRMRoute(farmer, buyer) {
  const statusEl = document.getElementById('fpoRouteStatus');
  if (statusEl) statusEl.textContent = 'Calculating OSRM Road Distance...';

  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${farmer.longitude},${farmer.latitude};${buyer.longitude},${buyer.latitude}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(osrmUrl);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      lastCalculatedRoadDistance = parseFloat((route.distance / 1000).toFixed(2));
      const mins = Math.round(route.duration / 60);

      if (statusEl) statusEl.innerHTML = `🟢 OSRM Road Route: <strong>${lastCalculatedRoadDistance} KM</strong> (${mins} mins)`;

      if (routePolyline) fpoMap.removeLayer(routePolyline);
      routePolyline = L.geoJSON(route.geometry, { style: { color: '#16a34a', weight: 6, opacity: 0.85 } }).addTo(fpoMap);
      fpoMap.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
      return;
    }
  } catch (e) {
    console.warn('OSRM error:', e);
  }

  // Fallback Haversine
  const dist = haversine(farmer.latitude, farmer.longitude, buyer.latitude, buyer.longitude);
  lastCalculatedRoadDistance = parseFloat(dist.toFixed(2));
  if (statusEl) statusEl.innerHTML = `🟡 Direct Distance: <strong>${lastCalculatedRoadDistance} KM</strong>`;

  if (routePolyline) fpoMap.removeLayer(routePolyline);
  routePolyline = L.polyline([[farmer.latitude, farmer.longitude], [buyer.latitude, buyer.longitude]], {
    color: '#16a34a', weight: 4, dashArray: '6, 8'
  }).addTo(fpoMap);
  fpoMap.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
}

// 4. AgriStack Verification & Confirmation Modal
function resetFarmerForm() {
  document.getElementById('formAddFarmer').reset();
  document.getElementById('farmerFormStep1').style.display = 'block';
  document.getElementById('farmerConfirmStep2').style.display = 'none';
  stagedFarmerData = null;
}

function validateAndSimulateAgriStack() {
  const name = document.getElementById('inputFarmerName').value.trim();
  const location = document.getElementById('inputFarmerLoc').value.trim();
  const phone = document.getElementById('inputFarmerPhone').value.trim();
  const farmer_id = document.getElementById('inputFarmerId').value.trim();
  const crop_type = document.getElementById('inputCropType').value.trim();
  const quantity = parseFloat(document.getElementById('inputCropQty').value);
  const exp_price = parseFloat(document.getElementById('inputExpPrice').value);
  const max_price = parseFloat(document.getElementById('inputMaxPrice').value);

  if (!name || !location || !phone || !farmer_id || !crop_type || isNaN(quantity) || isNaN(exp_price) || isNaN(max_price)) {
    FB_AUTH.showToast('Please fill in all mandatory farmer credentials.', 'warning');
    return;
  }

  FB_AUTH.showToast('Validating with National AgriStack Central Registry...', 'info');

  setTimeout(() => {
    const lat = 10.5 + (Math.random() * 0.8);
    const lng = 77.2 + (Math.random() * 1.5);

    stagedFarmerData = {
      farmer_id,
      name,
      location,
      phone,
      crop_type,
      quantity_quintals: quantity,
      expected_price: exp_price,
      max_sellable_price: max_price,
      latitude: parseFloat(lat.toFixed(4)),
      longitude: parseFloat(lng.toFixed(4)),
      verified_status: 'Verified by AgriStack'
    };

    document.getElementById('confirmFarmerName').textContent = stagedFarmerData.name;
    document.getElementById('confirmFarmerId').textContent = stagedFarmerData.farmer_id;
    document.getElementById('confirmFarmerLoc').textContent = stagedFarmerData.location;
    document.getElementById('confirmCropInfo').textContent = `${stagedFarmerData.crop_type} (${stagedFarmerData.quantity_quintals} Quintals)`;
    document.getElementById('confirmPrices').textContent = `Expected: ₹${stagedFarmerData.expected_price}/qtl | Max: ₹${stagedFarmerData.max_sellable_price}/qtl`;

    document.getElementById('farmerFormStep1').style.display = 'none';
    document.getElementById('farmerConfirmStep2').style.display = 'block';
  }, 700);
}

async function commitFarmerToDb() {
  if (!stagedFarmerData) return;

  const session = FB_AUTH.getFpoSession() || JSON.parse(sessionStorage.getItem('fb_fpo_session') || '{}');
  stagedFarmerData.fpo_id = session.fpo_id || 'FPO-TN-CBE-01';

  try {
    const res = await fetch('/api/farmer/add-agristack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stagedFarmerData)
    });
    const data = await res.json();

    if (data.status === 'success') {
      FB_AUTH.showToast('AgriStack Farmer successfully added to database!', 'success');
      document.getElementById('modalAddFarmer').classList.remove('active');
      loadFpoData(stagedFarmerData.fpo_id);
    } else {
      FB_AUTH.showToast(data.message || 'Failed to add farmer', 'error');
    }
  } catch (err) {
    FB_AUTH.showToast('Error saving farmer to database.', 'error');
  }
}

// 5. Route Calculation & Government Tax Invoice Generation
async function calculateFreightAndGenerateBill() {
  const farmerId = document.getElementById('routeFarmerSelect').value;
  const buyerId = document.getElementById('routeBuyerSelect').value;
  const vehicleType = document.getElementById('routeVehicleSelect').value;

  if (!farmerId || !buyerId || !vehicleType) {
    FB_AUTH.showToast('Please select Farmer, Buyer Mandi, and Transport Vehicle.', 'warning');
    return;
  }

  const payload = {
    farmer_id: farmerId,
    buyer_id: parseInt(buyerId),
    vehicle_type: vehicleType,
    distance_km: lastCalculatedRoadDistance
  };

  try {
    const res = await fetch('/api/logistics/calculate-and-bill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'success') {
      renderInvoiceAndRoute(data.invoice, data.farmer, data.buyer);
      FB_AUTH.showToast('Official Tax Invoice & Waybill generated successfully!', 'success');
    } else {
      FB_AUTH.showToast(data.message || 'Bill calculation failed', 'error');
    }
  } catch (err) {
    FB_AUTH.showToast('Error generating bill.', 'error');
  }
}

function renderInvoiceAndRoute(invoice, farmer, buyer) {
  drawOSRMRoute(farmer, buyer);

  const invoiceContainer = document.getElementById('generatedInvoiceContainer');
  if (invoiceContainer) {
    invoiceContainer.style.display = 'block';
    invoiceContainer.scrollIntoView({ behavior: 'smooth' });

    invoiceContainer.innerHTML = `
      <div class="tax-invoice-sheet" id="printArea">
        <div class="invoice-header-gov">
          <div style="display:flex; justify-content:center; align-items:center; gap: 12px; margin-bottom: 6px;">
            <span style="font-size: 1.8rem;">🏛️</span>
            <div>
              <h2>GOVERNMENT OF INDIA - OFFICIAL TAX INVOICE & e-WAY BILL</h2>
              <p>Ministry of Agriculture & Farmers Welfare | National Electronic Mandi Integration (e-NAM / AgriStack)</p>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size: 0.8rem; font-weight: 600; color: #334155; margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 6px;">
            <span>Waybill No: <strong>FARM-BILL-2026-${invoice.order_id}</strong></span>
            <span>Date & Time: <strong>${invoice.created_at || new Date().toLocaleString()}</strong></span>
            <span>Status: <strong style="color:#047857;">VERIFIED & ACTIVE</strong></span>
          </div>
        </div>

        <div class="invoice-meta-grid">
          <div class="invoice-party-box">
            <h5>Consignor / Farmer Details</h5>
            <p><strong>Name:</strong> ${farmer.name}</p>
            <p><strong>AgriStack ID:</strong> ${farmer.farmer_id}</p>
            <p><strong>Origin:</strong> ${farmer.location}</p>
            <p><strong>Contact:</strong> ${farmer.phone}</p>
          </div>

          <div class="invoice-party-box">
            <h5>Consignee / Mandi Buyer Details</h5>
            <p><strong>Firm / Mandi:</strong> ${buyer.name}</p>
            <p><strong>Mandi License:</strong> ${buyer.unique_license_id}</p>
            <p><strong>Destination:</strong> ${buyer.location}</p>
            <p><strong>Contact:</strong> ${buyer.phone}</p>
          </div>
        </div>

        <div class="invoice-party-box" style="margin-bottom: 18px;">
          <h5>Transport & Multi-Tier Vehicle Allocation</h5>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
            <p><strong>Vehicle Tier:</strong> ${invoice.vehicle_type}</p>
            <p><strong>Assigned Driver:</strong> ${invoice.driver_name || 'Government Commercial Dispatch'}</p>
            <p><strong>Driver DL / RC:</strong> ${invoice.driver_rc || 'TN-38-AB-1234'}</p>
            <p><strong>Transit Road Distance:</strong> ${invoice.transport_distance_km} KM</p>
          </div>
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>Item #</th>
              <th>Crop Description & Standard Grade</th>
              <th>Quantity (Quintals)</th>
              <th>Agreed Rate (₹ / Qtl)</th>
              <th>Total Crop Value (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><strong>${invoice.crop_type}</strong> (Govt AgriStack Grade A)</td>
              <td>${invoice.quantity_quintals} Qtl</td>
              <td>₹${invoice.agreed_price_per_qtl.toLocaleString()}</td>
              <td>₹${invoice.crop_total_cost.toLocaleString()}</td>
            </tr>
            <tr>
              <td colspan="4" style="text-align: right; font-weight: 600;">Base Vehicle Fare:</td>
              <td style="font-weight: 700;">₹${invoice.base_fare || 400}</td>
            </tr>
            <tr>
              <td colspan="4" style="text-align: right; font-weight: 600;">Mileage Fare (${invoice.transport_distance_km} km @ rate):</td>
              <td style="font-weight: 700;">₹${Math.round(invoice.transport_distance_km * (invoice.rate_per_km || 18)).toLocaleString()}</td>
            </tr>
            <tr>
              <td colspan="4" style="text-align: right; font-weight: 600;">Handling & Loading Surcharge (${invoice.quantity_quintals} Qtl @ ₹5):</td>
              <td style="font-weight: 700;">₹${invoice.handling_surcharge || 250}</td>
            </tr>
            <tr class="invoice-total-row">
              <td colspan="4" style="text-align: right; font-size: 1rem; color: #047857;">GRAND TOTAL PAYABLE (INR):</td>
              <td style="font-size: 1.1rem; color: #047857;">₹${invoice.grand_total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div class="invoice-signatures">
          <div>
            <p>Authorized Signatory (FPO / Mandi Officer)</p>
            <p style="margin-top: 24px; font-weight: 700;">[ Electronically Signed via AgriStack PKI ]</p>
          </div>
          <div style="text-align: right;">
            <p>Consignee Mandi Acceptance Stamp</p>
            <p style="margin-top: 24px; font-weight: 700;">[ Verified Mandi Trader Stamp ]</p>
          </div>
        </div>

        <div class="no-print" style="margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-primary" onclick="window.print()">🖨️ Print Official Invoice / PDF</button>
        </div>
      </div>
    `;
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
