const form = document.getElementById("donation-form");
const donationList = document.getElementById("donation-list");
const searchInput = document.getElementById("search-input");
let donations = [];
let toastTimer;
let userPosition = null;
let nearbyPartners = { restaurants: [], recipients: [] };
let selectedRecipient = null;
let accountUser = null;
let claimDonationId = null;

const restaurantList = document.getElementById("restaurant-list");
const recipientList = document.getElementById("recipient-list");
const locationStatus = document.getElementById("location-status");
const shipmentList = document.getElementById("shipment-list");

function distanceKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function mapLink(place) {
  return `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`;
}

function renderPartners() {
  restaurantList.innerHTML = nearbyPartners.restaurants.length ? nearbyPartners.restaurants.map(place => `
    <article class="partner-card">
      <div><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.kind)} · ${place.distanceKm.toFixed(1)} km away</small></div>
      <div class="partner-actions"><a class="small-btn secondary" href="${mapLink(place)}" target="_blank" rel="noopener noreferrer">Map</a><button class="small-btn" data-partner-action="pickup" data-id="${place.id}">Use for pickup</button></div>
    </article>`).join("") : '<div class="empty-state">No mapped restaurants found nearby. You can still enter an address below.</div>';

  recipientList.innerHTML = nearbyPartners.recipients.length ? nearbyPartners.recipients.map(place => `
    <article class="partner-card ${selectedRecipient?.id === place.id ? "partner-selected" : ""}">
      <div><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.kind)} · ${place.distanceKm.toFixed(1)} km away</small></div>
      <div class="partner-actions"><a class="small-btn secondary" href="${mapLink(place)}" target="_blank" rel="noopener noreferrer">Map</a><button class="small-btn" data-partner-action="recipient" data-id="${place.id}">${selectedRecipient?.id === place.id ? "Selected" : "Select recipient"}</button></div>
    </article>`).join("") : '<div class="empty-state">No mapped food recipients found nearby. Try a larger radius or verify local organizations manually.</div>';

  document.getElementById("selected-recipient").textContent = selectedRecipient
    ? `Claiming as: ${selectedRecipient.name}`
    : "No recipient selected. Select a partner to claim available food.";
  renderDonations();
}

async function findNearbyPartners(position) {
  userPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  await searchNearbyPartners();
}

async function searchNearbyPartners() {
  locationStatus.textContent = "Searching OpenStreetMap for food partners near you…";
  document.getElementById("locate-btn").disabled = true;
  try {
    const radius = Number(document.getElementById("nearby-radius").value);
    nearbyPartners = await api(`/api/nearby?lat=${userPosition.latitude}&lon=${userPosition.longitude}&radius=${radius}`);
    for (const group of [nearbyPartners.restaurants, nearbyPartners.recipients]) {
      for (const place of group) place.distanceKm = distanceKm(userPosition, place);
      group.sort((a, b) => a.distanceKm - b.distanceKm);
    }
    const timestamp = nearbyPartners.updatedAt ? new Date(nearbyPartners.updatedAt).toLocaleTimeString() : "just now";
    locationStatus.textContent = `${nearbyPartners.restaurants.length} potential food donors and ${nearbyPartners.recipients.length} potential recipients found within ${radius / 1000} km · refreshed ${timestamp}.`;
    renderPartners();
  } catch (error) {
    locationStatus.textContent = error.message;
  } finally {
    document.getElementById("locate-btn").disabled = false;
  }
}

document.getElementById("locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = "This browser does not support location sharing.";
    return;
  }
  locationStatus.textContent = "Waiting for location permission…";
  navigator.geolocation.getCurrentPosition(findNearbyPartners, error => {
    const reasons = { 1: "Location permission was denied. Allow location access in your browser to find nearby partners.", 2: "Your location is unavailable. Check your device location settings and try again.", 3: "Location lookup timed out. Please try again." };
    locationStatus.textContent = reasons[error.code] || "Could not get your location.";
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
});

document.getElementById("nearby-radius").addEventListener("change", () => {
  if (userPosition) searchNearbyPartners();
});

document.getElementById("nearby-partners").addEventListener("click", event => {
  const button = event.target.closest("button[data-partner-action]");
  if (!button) return;
  const group = button.dataset.partnerAction === "pickup" ? nearbyPartners.restaurants : nearbyPartners.recipients;
  const place = group.find(item => String(item.id) === button.dataset.id);
  if (!place) return;
  if (button.dataset.partnerAction === "pickup") {
    document.getElementById("donor").value = place.name;
    document.getElementById("location").value = place.name;
    document.getElementById("latitude").value = place.latitude;
    document.getElementById("longitude").value = place.longitude;
    document.getElementById("add-donation").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`${place.name} selected as the pickup location.`);
  } else {
    selectedRecipient = place;
    renderPartners();
    showToast(`${place.name} selected to receive food.`);
  }
});

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function expiryLabel(expiryAt) {
  const minutes = Math.round((new Date(expiryAt).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

function renderStats() {
  document.getElementById("total-count").textContent = donations.length;
  document.getElementById("available-count").textContent = donations.filter(d => d.status === "Available").length;
  document.getElementById("matched-count").textContent = donations.filter(d => d.status === "Matched").length;
  document.getElementById("meal-count").textContent = donations.reduce((sum, d) => sum + Number(d.quantity || 0), 0).toLocaleString();
}

function renderDonations() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = donations.filter(d => {
    const matchesText = `${d.foodName} ${d.donor} ${d.location}`.toLowerCase().includes(query);
    return d.status === "Available" && matchesText;
  });

  if (!filtered.length) {
    donationList.innerHTML = '<div class="empty-state">No food is currently available. Confirmed claims are tracked in Shipments below.</div>';
    return;
  }

  donationList.innerHTML = filtered.map(d => `
    <article class="donation-item">
      <div>
        <h3>${escapeHtml(d.foodName)}</h3>
        <div class="donation-meta">${Number(d.quantity)} meals · ${escapeHtml(d.donor)}<br>
          Pickup: ${escapeHtml(d.location)} · ${escapeHtml(expiryLabel(d.expiryAt))}
          ${userPosition && Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)) ? `<br>${distanceKm(userPosition, { latitude: Number(d.latitude), longitude: Number(d.longitude) }).toFixed(1)} km from you` : ""}
          ${d.ngo ? `<br>Assigned to: ${escapeHtml(d.ngo)}` : ""}
          ${d.recipient ? `<br>Contact: ${escapeHtml(d.recipient.contactName)} · ${escapeHtml(d.recipient.phone)}<br>Delivery: ${escapeHtml(d.recipient.address)}${d.recipient.latitude != null ? ` · <a href="https://www.openstreetmap.org/?mlat=${Number(d.recipient.latitude)}&mlon=${Number(d.recipient.longitude)}#map=17/${Number(d.recipient.latitude)}/${Number(d.recipient.longitude)}" target="_blank" rel="noopener noreferrer">Map</a>` : ""}` : ""}
        </div>
      </div>
      <span class="status ${d.status === "Matched" ? "matched" : ""}">${escapeHtml(d.status)}</span>
      <div class="donation-actions">
        ${d.status === "Available"
          ? `<button class="small-btn" data-action="assign" data-id="${d.id}">Claim food</button>`
          : '<span class="claim-confirmed">✓ Claim confirmed</span>'}
      </div>
    </article>
  `).join("");
}

function formatShipmentTime(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not scheduled" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function renderShipments() {
  const active = donations.filter(donation => donation.status === "Matched");
  document.getElementById("shipment-count").textContent = `${active.length} ACTIVE SHIPMENT${active.length === 1 ? "" : "S"}`;
  if (!active.length) {
    shipmentList.innerHTML = '<div class="empty-state">Confirmed food claims will appear here with courier, delivery, and timing details.</div>';
    return;
  }
  shipmentList.innerHTML = active.map(donation => {
    const recipient = donation.recipient || {};
    const shipment = donation.shipment || {};
    const carrier = shipment.carrier || { name: "Courier assignment pending", role: "FoodBridge delivery partner", vehicle: "Pending" };
    const origin = donation.latitude != null && donation.longitude != null ? `${donation.latitude},${donation.longitude}` : donation.location;
    const destination = recipient.latitude != null && recipient.longitude != null ? `${recipient.latitude},${recipient.longitude}` : recipient.address || recipient.organization || "Recipient address not provided";
    const directions = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    return `<article class="shipment-detail-card">
      <div class="shipment-track-top"><div><small>SHIPMENT TRACKING ID</small><strong>${escapeHtml(shipment.id || `FB-${String(donation.id).padStart(4, "0")}`)}</strong></div><span class="shipment-state"><span class="live-dot"></span>${escapeHtml(shipment.status || "Claim confirmed · courier assignment pending")}</span></div>
      <div class="shipment-route-grid"><section class="shipment-place"><small>PICKUP FROM · DONOR</small><strong>${escapeHtml(donation.donor)}</strong><p>${escapeHtml(donation.location)}${donation.latitude != null && donation.longitude != null ? ` · ${Number(donation.latitude).toFixed(5)}, ${Number(donation.longitude).toFixed(5)}` : ""}</p></section><section class="shipment-place delivery-place"><small>DELIVER TO · RECIPIENT</small><strong>${escapeHtml(recipient.organization || donation.ngo || "Recipient details not provided")}</strong><p>${escapeHtml(recipient.address || "Delivery address not provided")}</p><p>${recipient.contactName ? `${escapeHtml(recipient.contactName)} · ${escapeHtml(recipient.phone || "")}` : "Contact details not provided"}</p></section></div>
      <div class="shipment-info-grid"><div class="shipment-info"><small>FOOD &amp; QUANTITY</small><strong>${escapeHtml(donation.foodName)} · ${Number(donation.quantity)} meals</strong></div><div class="shipment-info"><small>DELIVERY PARTNER · DEMO</small><strong>${escapeHtml(carrier.name)}</strong><span>${escapeHtml(carrier.role)} · ${escapeHtml(carrier.vehicle)}</span></div><div class="shipment-info"><small>CLAIM CONFIRMED</small><strong>${escapeHtml(formatShipmentTime(shipment.claimedAt || recipient.claimedAt))}</strong></div><div class="shipment-info"><small>ESTIMATED PICKUP</small><strong>${escapeHtml(formatShipmentTime(shipment.estimatedPickupAt))}</strong></div><div class="shipment-info"><small>ESTIMATED DELIVERY</small><strong>${escapeHtml(formatShipmentTime(shipment.estimatedDeliveryAt))}</strong></div>${recipient.notes ? `<div class="shipment-info shipment-notes"><small>DELIVERY NOTES</small><strong>${escapeHtml(recipient.notes)}</strong></div>` : ""}</div>
      <div class="shipment-card-footer"><span>Times are estimates for this project demo.</span><a href="${directions}" target="_blank" rel="noopener noreferrer">Open route in Google Maps ↗</a></div>
    </article>`;
  }).join("");
}

async function loadDonations() {
  try {
    donations = await api("/api/donations");
    renderStats();
    renderDonations();
    renderShipments();
  } catch (error) {
    donationList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)} Make sure the server is running.</div>`;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  body.quantity = Number(body.quantity);
  body.expiryHours = Number(body.expiryHours);
  body.latitude = body.latitude ? Number(body.latitude) : null;
  body.longitude = body.longitude ? Number(body.longitude) : null;
  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;
  document.getElementById("form-message").textContent = "";

  try {
    await api("/api/donations", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    document.getElementById("latitude").value = "";
    document.getElementById("longitude").value = "";
    document.getElementById("form-message").textContent = "Donation saved successfully.";
    await loadDonations();
    showToast("Donation added.");
  } catch (error) {
    document.getElementById("form-message").textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

donationList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "assign") {
    const donation = donations.find(item => String(item.id) === String(id));
    if (!donation) return;
    claimDonationId = id;
    document.getElementById("claim-food-summary").textContent = `${donation.foodName} · ${Number(donation.quantity)} meals · Pickup from ${donation.donor} (${donation.location})`;
    document.getElementById("claim-organization").value = accountUser?.role === "recipient" ? accountUser.organization : selectedRecipient?.name || "";
    document.getElementById("claim-contact").value = "";
    document.getElementById("claim-phone").value = "";
    document.getElementById("claim-address").value = "";
    document.getElementById("claim-notes").value = "";
    document.getElementById("claim-latitude").value = "";
    document.getElementById("claim-longitude").value = "";
    document.getElementById("claim-error").textContent = "";
    document.getElementById("claim-location-status").textContent = "Enter the recipient address or use the device location.";
    document.getElementById("claim-map-link").classList.add("hidden");
    document.getElementById("claim-dialog").showModal();
    return;
  }

});

searchInput.addEventListener("input", renderDonations);
document.getElementById("refresh-btn").addEventListener("click", loadDonations);
document.querySelectorAll("[data-demo-role]").forEach(button => button.addEventListener("click", () => {
  const role = button.dataset.demoRole === "donor" ? "food donor / restaurant" : "food recipient / community organization";
  const message = document.getElementById("auth-message");
  message.textContent = `Demo registration selected for ${role}. Secure Google sign-in can be enabled after a Google OAuth client is registered for this app.`;
  message.scrollIntoView({ behavior: "smooth", block: "nearest" });
}));
document.getElementById("location").addEventListener("input", () => {
  document.getElementById("latitude").value = "";
  document.getElementById("longitude").value = "";
});

const claimDialog = document.getElementById("claim-dialog");
const claimAddress = document.getElementById("claim-address");
const claimMapLink = document.getElementById("claim-map-link");
function updateClaimMapLink() {
  const latitude = document.getElementById("claim-latitude").value;
  const longitude = document.getElementById("claim-longitude").value;
  const address = claimAddress.value.trim();
  if (latitude && longitude) {
    claimMapLink.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
    claimMapLink.textContent = "View current delivery location on map ↗";
    claimMapLink.classList.remove("hidden");
  } else if (address) {
    claimMapLink.href = `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
    claimMapLink.textContent = "Search this address on map ↗";
    claimMapLink.classList.remove("hidden");
  } else claimMapLink.classList.add("hidden");
}

claimAddress.addEventListener("input", () => {
  document.getElementById("claim-latitude").value = "";
  document.getElementById("claim-longitude").value = "";
  updateClaimMapLink();
});

async function useClaimCurrentLocation() {
  const button = document.getElementById("use-current-location");
  const status = document.getElementById("claim-location-status");
  if (!navigator.geolocation) { status.textContent = "This browser does not support location. Enter the address manually."; return; }
  button.disabled = true;
  status.textContent = "Waiting for location permission…";
  navigator.geolocation.getCurrentPosition(async position => {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    document.getElementById("claim-latitude").value = latitude;
    document.getElementById("claim-longitude").value = longitude;
    status.textContent = `Location found (${latitude.toFixed(5)}, ${longitude.toFixed(5)}). Looking up street address…`;
    updateClaimMapLink();
    try {
      const result = await api(`/api/reverse-geocode?lat=${latitude}&lon=${longitude}`);
      claimAddress.value = result.address;
      status.textContent = "Address filled from your current map location. Check it before confirming.";
    } catch (error) {
      status.textContent = `Location pinned. ${error.message} You can enter the address manually.`;
    }
    button.disabled = false;
    updateClaimMapLink();
  }, error => {
    const reasons = { 1: "Location permission was denied. Allow access or enter the address manually.", 2: "Could not find your location. Enter the address manually.", 3: "Location lookup timed out. Please try again or enter the address manually." };
    status.textContent = reasons[error.code] || "Could not find your location. Enter the address manually.";
    button.disabled = false;
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}

document.getElementById("use-current-location").addEventListener("click", useClaimCurrentLocation);
document.getElementById("cancel-claim").addEventListener("click", () => claimDialog.close());
document.getElementById("close-claim").addEventListener("click", () => claimDialog.close());
claimDialog.addEventListener("click", event => { if (event.target === claimDialog) claimDialog.close(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && claimDialog.open) claimDialog.close(); });
document.getElementById("claim-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!claimDonationId) return;
  const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
  const submit = document.getElementById("submit-claim");
  submit.disabled = true;
  document.getElementById("claim-error").textContent = "";
  try {
    const recipient = {
      organization: formData.organization,
      contactName: formData.contactName,
      phone: formData.phone,
      address: formData.address,
      latitude: formData.latitude || null,
      longitude: formData.longitude || null,
      notes: formData.notes
    };
    await api(`/api/donations/${claimDonationId}/assign`, { method: "POST", body: JSON.stringify({ ngo: recipient.organization, recipient }) });
    claimDialog.close();
    showToast(`Food claimed for ${recipient.organization}.`);
    claimDonationId = null;
    await loadDonations();
    document.getElementById("shipment-tracking").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    document.getElementById("claim-error").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

async function updateAccountNavigation() {
  const link = document.querySelector(".nav-login");
  if (!link) return;
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) return;
    const { user } = await response.json();
    accountUser = user;
    link.href = "#logout";
    link.textContent = "Log out";
    link.title = `Logged in as ${user.organization} (${user.role})`;
    link.addEventListener("click", async event => {
      event.preventDefault();
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    });
    if (user.role === "donor") document.getElementById("donor").value = user.organization;
    if (user.role === "recipient") {
      selectedRecipient = { id: `account:${user.id}`, name: user.organization, kind: "registered recipient" };
      document.getElementById("selected-recipient").textContent = `Claiming as: ${user.organization}`;
    }
  } catch (_) {
    // Keep the public dashboard usable when no account session exists.
  }
}

updateAccountNavigation();
loadDonations();
