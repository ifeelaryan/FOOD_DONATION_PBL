const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const {
  greedyMatchDonations,
  dijkstra
} = require("./src/algorithms");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "donations.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const sessions = new Map();
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const nearbyCache = new Map();
const reverseGeocodeCache = new Map();

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(getSampleDonations(), null, 2));
  }
}

function readUsers() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function requestSession(req) {
  const cookie = req.headers.cookie || "";
  const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith("foodbridge_session="))?.slice("foodbridge_session=".length);
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return { token, session };
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `foodbridge_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION / 1000}${secure}`);
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, organization: user.organization };
}

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = req.body.role;
  const organization = String(req.body.organization || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!['donor', 'recipient'].includes(role)) return res.status(400).json({ error: "Choose food donor or recipient." });
  if (!organization || organization.length > 100) return res.status(400).json({ error: "Enter your restaurant or organization name (up to 100 characters)." });
  const users = readUsers();
  if (users.some(user => user.email === email)) return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await scrypt(password, salt, 64);
  const user = { id: crypto.randomUUID(), email, role, organization, salt, passwordHash: passwordHash.toString("hex"), createdAt: new Date().toISOString() };
  users.push(user);
  writeUsers(users);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_DURATION });
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = req.body.role;
  const users = readUsers();
  const user = users.find(item => item.email === email && item.role === role);
  if (!user) return res.status(401).json({ error: "No account found for that email and account type. Check your details or register." });
  const attemptedHash = await scrypt(password, user.salt, 64);
  const storedHash = Buffer.from(user.passwordHash, "hex");
  if (storedHash.length !== attemptedHash.length || !crypto.timingSafeEqual(storedHash, attemptedHash)) {
    return res.status(401).json({ error: "Incorrect password. Please try again." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_DURATION });
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

app.get("/api/auth/me", (req, res) => {
  const current = requestSession(req);
  if (!current) return res.status(401).json({ error: "Please log in." });
  const user = readUsers().find(item => item.id === current.session.userId);
  if (!user) return res.status(401).json({ error: "Please log in." });
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const current = requestSession(req);
  if (current) sessions.delete(current.token);
  res.setHeader("Set-Cookie", "foodbridge_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

function getSampleDonations() {
  const now = Date.now();
  return [
    {
      id: 1, foodName: "Vegetable Rice Meals", quantity: 30,
      donor: "Sunrise Campus Canteen (demo)", location: "College", expiryAt: new Date(now + 60 * 60 * 1000).toISOString(),
      status: "Available", ngo: null
    },
    {
      id: 2, foodName: "Bread and Sandwiches", quantity: 18,
      donor: "Green Leaf Cafe (demo)", location: "Market", expiryAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      status: "Available", ngo: null
    },
    {
      id: 3, foodName: "Packed Lunch Boxes", quantity: 45,
      donor: "Station Square Bakery (demo)", location: "Station", expiryAt: new Date(now + 90 * 60 * 1000).toISOString(),
      status: "Available", ngo: null
    },
    {
      id: 4, foodName: "Fresh Fruit Packs", quantity: 20,
      donor: "Fresh Basket Market (demo)", location: "Market", expiryAt: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
      status: "Available", ngo: null
    }
  ];
}

function readDonations() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeDonations(donations) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(donations, null, 2));
}

function nextId(donations) {
  return donations.reduce((max, d) => Math.max(max, Number(d.id) || 0), 0) + 1;
}

app.get("/api/donations", (req, res) => {
  res.json(readDonations());
});

app.get("/api/nearby", async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const radius = Math.min(10000, Math.max(500, Number(req.query.radius) || 5000));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "A valid location is required to search nearby partners." });
  }

  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radius}`;
  const cached = nearbyCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) return res.json(cached.data);

  const query = `[out:json][timeout:20];(
    nwr(around:${radius},${latitude},${longitude})[amenity~"^(restaurant|cafe|fast_food|food_court|ice_cream|bakery)$"];
    nwr(around:${radius},${latitude},${longitude})[shop~"^(bakery|deli|supermarket|convenience)$"];
    nwr(around:${radius},${latitude},${longitude})[amenity~"^(food_bank|social_facility|shelter|community_centre|social_centre)$"];
    nwr(around:${radius},${latitude},${longitude})[social_facility~"^(food_bank|soup_kitchen|shelter|community_centre|outreach)$"];
    nwr(around:${radius},${latitude},${longitude})[office=ngo];
  );out center tags;`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "FoodBridge/1.0" },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Place search returned ${response.status}. Please try again shortly.`);
    const payload = await response.json();
    const restaurants = [];
    const recipients = [];
    for (const element of payload.elements || []) {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const foodType = tags.amenity || tags.shop;
      const foodPlace = ["restaurant", "cafe", "fast_food", "food_court", "ice_cream", "bakery", "deli", "supermarket", "convenience"].includes(foodType);
      const name = tags.name || tags["name:en"] || tags.brand || tags.operator || `${foodPlace ? "Food business" : "Community organization"} (unnamed ${element.type} ${element.id})`;
      const place = {
        id: `${element.type}:${element.id}`,
        name: String(name).slice(0, 160),
        kind: String(foodPlace ? foodType : tags.social_facility || tags.amenity || "community organization").replaceAll("_", " "),
        latitude: lat,
        longitude: lon
      };
      (foodPlace ? restaurants : recipients).push(place);
    }
    const data = { restaurants, recipients, updatedAt: new Date().toISOString() };
    nearbyCache.set(cacheKey, { time: Date.now(), data });
    res.json(data);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Nearby place search timed out. Please try again."
      : error.message || "Nearby place search is temporarily unavailable.";
    res.status(502).json({ error: message });
  }
});

let lastReverseGeocodeAt = 0;
app.get("/api/reverse-geocode", async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "A valid map location is required." });
  }
  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (reverseGeocodeCache.has(key)) return res.json(reverseGeocodeCache.get(key));
  try {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastReverseGeocodeAt));
    if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    lastReverseGeocodeAt = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({ format: "jsonv2", lat: String(latitude), lon: String(longitude), zoom: "18", addressdetails: "1" }).toString();
    const response = await fetch(url, { headers: { "User-Agent": "FoodBridge/1.0 (food donation PBL demo)", "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Map address lookup is temporarily unavailable.");
    const result = await response.json();
    if (!result.display_name) throw new Error("No street address was found for this location. Please enter it manually.");
    const data = { address: result.display_name, latitude, longitude };
    reverseGeocodeCache.set(key, data);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.name === "TimeoutError" ? "Map address lookup timed out. Please enter the address manually." : error.message || "Map address lookup failed. Please enter the address manually." });
  }
});

app.post("/api/donations", (req, res) => {
  const { foodName, quantity, donor, location, expiryHours } = req.body;
  const parsedQuantity = Number(quantity);
  const parsedHours = Number(expiryHours);
  const latitude = req.body.latitude == null ? null : Number(req.body.latitude);
  const longitude = req.body.longitude == null ? null : Number(req.body.longitude);

  if (!foodName || !donor || !location ||
      !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 ||
      !Number.isFinite(parsedHours) || parsedHours <= 0 ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
      ((latitude === null) !== (longitude === null))) {
    return res.status(400).json({
      error: "Enter a food name, donor, location, positive quantity and positive expiry time."
    });
  }

  const donations = readDonations();
  const donation = {
    id: nextId(donations),
    foodName: String(foodName).trim(),
    quantity: Math.floor(parsedQuantity),
    donor: String(donor).trim(),
    location: String(location).trim(),
    latitude,
    longitude,
    expiryAt: new Date(Date.now() + parsedHours * 60 * 60 * 1000).toISOString(),
    status: "Available",
    ngo: null
  };
  donations.push(donation);
  writeDonations(donations);
  res.status(201).json(donation);
});

app.post("/api/optimize", (req, res) => {
  const donations = readDonations();
  const available = donations.filter(d => d.status === "Available");
  const ngos = [
    { name: "Hope Community Kitchen (demo)", location: "College", demand: 35 },
    { name: "Helping Hands Shelter (demo)", location: "Market", demand: 25 },
    { name: "Little Steps Family Center (demo)", location: "Station", demand: 50 }
  ];

  const result = greedyMatchDonations(available, ngos);
  res.json({
    matches: result.matches,
    unmatched: result.unmatched,
    ngos,
    routes: result.routes,
    explanation: "Available donations are sorted by urgency. Each donation is assigned to the nearest feasible NGO with remaining demand. Dijkstra calculates shortest paths on the sample location graph."
  });
});

app.post("/api/donations/:id/assign", (req, res) => {
  const id = Number(req.params.id);
  const recipient = req.body.recipient || {};
  const organization = String(recipient.organization || req.body.ngo || "").trim();
  const contactName = String(recipient.contactName || "").trim();
  const phone = String(recipient.phone || "").trim();
  const address = String(recipient.address || "").trim();
  const notes = String(recipient.notes || "").trim();
  const latitude = recipient.latitude == null || recipient.latitude === "" ? null : Number(recipient.latitude);
  const longitude = recipient.longitude == null || recipient.longitude === "" ? null : Number(recipient.longitude);
  if (!organization || organization.length > 100 || !contactName || contactName.length > 100 || !address || address.length > 300 || !/^[+()\d\s.-]{7,24}$/.test(phone)) {
    return res.status(400).json({ error: "Enter the recipient organization, contact name, valid phone number, and full delivery address." });
  }
  if (notes.length > 500 || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) || ((latitude === null) !== (longitude === null))) {
    return res.status(400).json({ error: "Check the delivery notes and map location." });
  }
  const donations = readDonations();
  const donation = donations.find(d => d.id === id);
  if (!donation) return res.status(404).json({ error: "Donation not found." });
  if (donation.status !== "Available") return res.status(409).json({ error: "This donation is no longer available." });
  donation.status = "Matched";
  donation.ngo = organization;
  const claimedAt = new Date();
  donation.recipient = { organization, contactName, phone, address, latitude, longitude, notes, claimedAt: claimedAt.toISOString() };
  donation.shipment = {
    id: `FB-${String(donation.id).padStart(4, "0")}-${Date.now().toString(36).toUpperCase().slice(-4)}`,
    status: "Preparing for pickup",
    claimedAt: claimedAt.toISOString(),
    estimatedPickupAt: new Date(claimedAt.getTime() + 15 * 60 * 1000).toISOString(),
    estimatedDeliveryAt: new Date(claimedAt.getTime() + 45 * 60 * 1000).toISOString(),
    carrier: { name: "Arjun Kumar", role: "Volunteer courier (demo)", vehicle: "E-bike" }
  };
  writeDonations(donations);
  res.json(donation);
});

app.get("/api/routes/:from/:to", (req, res) => {
  const result = dijkstra(req.params.from, req.params.to);
  if (!result) return res.status(404).json({ error: "No route found between these locations." });
  res.json(result);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

ensureDataFile();
app.listen(PORT, () => {
  console.log(`Food Donation Optimization app running at http://localhost:${PORT}`);
});
