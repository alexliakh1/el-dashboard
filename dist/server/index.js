async function geocodeLocation(query, apiKey) {
  const url = new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("limit", "1");
  const response = await fetch(url);
  if (!response.ok) throw new Error("TomTom geocoding failed");
  const data = await response.json();
  const match = data.results?.[0];
  if (!match?.position || typeof match.position.lat !== "number" || typeof match.position.lon !== "number") {
    throw new Error(`Location not found: ${query}`);
  }
  return {
    label: match.address?.freeformAddress || query,
    lat: match.position.lat,
    lon: match.position.lon,
  };
}

async function handleRouteRequest(request, env) {
  if (!env.TOMTOM_API_KEY) return Response.json({ error: "TomTom routing is not configured yet." }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const start = typeof body.start === "string" ? body.start.trim() : "";
  const end = typeof body.end === "string" ? body.end.trim() : "";
  const arriveAt = typeof body.arriveAt === "string" ? body.arriveAt : "";
  const arrivalDate = new Date(arriveAt);
  if (!start || !end || start.length > 240 || end.length > 240) return Response.json({ error: "Enter a valid start and destination." }, { status: 400 });
  if (!arriveAt || Number.isNaN(arrivalDate.getTime())) return Response.json({ error: "Choose a valid arrival time." }, { status: 400 });
  if (arrivalDate.getTime() <= Date.now()) return Response.json({ error: "Choose an arrival time in the future." }, { status: 400 });

  try {
    const [origin, destination] = await Promise.all([
      geocodeLocation(start, env.TOMTOM_API_KEY),
      geocodeLocation(end, env.TOMTOM_API_KEY),
    ]);
    const routeUrl = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lon}:${destination.lat},${destination.lon}/json`);
    routeUrl.searchParams.set("key", env.TOMTOM_API_KEY);
    routeUrl.searchParams.set("traffic", "true");
    routeUrl.searchParams.set("travelMode", "car");
    routeUrl.searchParams.set("routeType", "fastest");
    routeUrl.searchParams.set("routeRepresentation", "summaryOnly");
    routeUrl.searchParams.set("arriveAt", arrivalDate.toISOString());
    const response = await fetch(routeUrl);
    const data = await response.json();
    const summary = data.routes?.[0]?.summary;
    if (!response.ok || !summary?.departureTime || !summary.arrivalTime) throw new Error(data.detailedError?.message || "No driving route was found.");
    return Response.json({
      arrivalTime: summary.arrivalTime,
      departureTime: summary.departureTime,
      distanceMeters: summary.lengthInMeters || 0,
      endLabel: destination.label,
      startLabel: origin.label,
      trafficDelayInSeconds: summary.trafficDelayInSeconds || 0,
      travelTimeInSeconds: summary.travelTimeInSeconds || 0,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No route was found." }, { status: 502 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/route") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      return handleRouteRequest(request, env);
    }
    const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const assetRequest = new Request(new URL(assetPath, request.url), request);
    const response = await env.ASSETS.fetch(assetRequest);
    if (assetPath !== "/index.html" || !response.ok) return response;
    const html = (await response.text()).replaceAll("__SITE_ORIGIN__", url.origin);
    return new Response(html, { status: response.status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  },
};
