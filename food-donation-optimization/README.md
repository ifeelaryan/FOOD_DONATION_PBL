# FoodBridge — Food Donation Optimization

A small, runnable college PBL demonstrating full-stack web development and three DAA concepts:
- **Sorting:** available donations are ordered by time remaining before expiry.
- **Greedy matching:** each donation is assigned to the nearest NGO with sufficient remaining demand.
- **Dijkstra's algorithm:** computes shortest paths in a small sample road-distance graph.

## Requirements
- Node.js 18 or newer
- npm (included with Node.js)

No database server is required. Donations are stored in `data/donations.json`.

## Run locally
1. Extract the ZIP and open the `food-donation-optimization` folder in VS Code.
2. Open a terminal in that folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser.

For automatic server restart during development, run `npm run dev` instead.

## How to demonstrate
1. View the sample donations on the dashboard.
2. Add a new donation with a pickup location and expiry duration.
3. Click **Optimize donations**.
4. Explain that sorting puts the most urgent donation first, greedy matching selects a feasible nearby NGO, and Dijkstra returns a shortest path over the sample graph.
5. Click **Claim food**, enter the recipient and delivery details, then confirm. The donation stays matched and its recipient details appear on the dashboard.

## Sample graph
The locations are College, Market, Station and Shelter. The weights are illustrative distances in kilometres, not live map data.

- College — Market: 4 km
- College — Station: 7 km
- College — Shelter: 3 km
- Market — Station: 2 km
- Market — Shelter: 5 km
- Station — Shelter: 4 km

## API endpoints
- `GET /api/donations` — list donations
- `POST /api/donations` — add a donation
- `POST /api/optimize` — run matching and shortest-path logic
- `POST /api/donations/:id/assign` — mark a donation matched
- `GET /api/routes/:from/:to` — test Dijkstra for two known locations

## Algorithm notes for viva
- Sorting: O(n log n) for `n` donations.
- Dijkstra: this implementation uses a simple scan to choose the closest unvisited node, O(V²) for `V` graph vertices.
- Greedy matching: this is a heuristic. It makes a locally sensible choice at each step, but it is not guaranteed to find the globally optimal allocation.
- NGO demands and distances are hard-coded sample data for a compact demonstration. The app is a PBL prototype, not a production food-safety or logistics system.

## Reset demo data
Stop the server, then edit or remove `data/donations.json`. If removed, the server recreates it with fresh sample data on the next start.
