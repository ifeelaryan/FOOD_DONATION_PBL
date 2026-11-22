// DAA concepts used in this project:
// 1. Sorting: donations with the least time remaining are considered first.
// 2. Greedy matching: assign each donation to the nearest NGO with enough remaining demand.
// 3. Dijkstra: find the shortest path through a small weighted location graph.

const GRAPH = {
  College: { Market: 4, Station: 7, Shelter: 3 },
  Market: { College: 4, Station: 2, Shelter: 5 },
  Station: { College: 7, Market: 2, Shelter: 4 },
  Shelter: { College: 3, Market: 5, Station: 4 }
};

function dijkstra(start, destination) {
  if (!GRAPH[start] || !GRAPH[destination]) return null;

  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(GRAPH));

  for (const node of unvisited) {
    distances[node] = Infinity;
    previous[node] = null;
  }
  distances[start] = 0;

  while (unvisited.size > 0) {
    let current = null;
    for (const node of unvisited) {
      if (current === null || distances[node] < distances[current]) current = node;
    }
    if (current === null || distances[current] === Infinity) break;
    if (current === destination) break;

    unvisited.delete(current);
    for (const [neighbor, weight] of Object.entries(GRAPH[current])) {
      if (!unvisited.has(neighbor)) continue;
      const candidate = distances[current] + weight;
      if (candidate < distances[neighbor]) {
        distances[neighbor] = candidate;
        previous[neighbor] = current;
      }
    }
  }

  if (distances[destination] === Infinity) return null;
  const path = [];
  let current = destination;
  while (current) {
    path.unshift(current);
    current = previous[current];
  }
  return { from: start, to: destination, distanceKm: distances[destination], path };
}

function greedyMatchDonations(donations, ngos) {
  const now = Date.now();
  const remainingDemand = new Map(ngos.map(ngo => [ngo.name, ngo.demand]));
  const validDonations = donations
    .filter(d => new Date(d.expiryAt).getTime() > now)
    .map(d => ({
      ...d,
      minutesRemaining: Math.max(0, Math.round((new Date(d.expiryAt).getTime() - now) / 60000))
    }))
    // Sorting by urgency is the first DAA step.
    .sort((a, b) => a.minutesRemaining - b.minutesRemaining);

  const matches = [];
  const unmatched = [];

  for (const donation of validDonations) {
    const candidates = ngos
      .filter(ngo => (remainingDemand.get(ngo.name) || 0) > 0)
      .map(ngo => {
        const route = dijkstra(donation.location, ngo.location);
        return { ngo, route };
      })
      .filter(candidate => candidate.route)
      .sort((a, b) => a.route.distanceKm - b.route.distanceKm);

    const selected = candidates.find(candidate =>
      remainingDemand.get(candidate.ngo.name) >= donation.quantity
    );

    if (!selected) {
      unmatched.push({
        donationId: donation.id,
        foodName: donation.foodName,
        reason: "No reachable NGO has enough remaining demand for this donation."
      });
      continue;
    }

    remainingDemand.set(
      selected.ngo.name,
      remainingDemand.get(selected.ngo.name) - donation.quantity
    );

    matches.push({
      donationId: donation.id,
      foodName: donation.foodName,
      quantity: donation.quantity,
      donor: donation.donor,
      donorLocation: donation.location,
      expiryAt: donation.expiryAt,
      minutesRemaining: donation.minutesRemaining,
      ngo: selected.ngo.name,
      ngoLocation: selected.ngo.location,
      distanceKm: selected.route.distanceKm,
      route: selected.route.path,
      priority: donation.minutesRemaining <= 90 ? "High" : donation.minutesRemaining <= 240 ? "Medium" : "Low"
    });
  }

  return {
    matches,
    unmatched,
    routes: matches.map(match => ({
      donationId: match.donationId,
      from: match.donorLocation,
      to: match.ngoLocation,
      distanceKm: match.distanceKm,
      path: match.route
    }))
  };
}

module.exports = { dijkstra, greedyMatchDonations };
