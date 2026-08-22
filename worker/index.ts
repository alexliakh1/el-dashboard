/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TOMTOM_API_KEY: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type GeocodeResult = {
  address?: { freeformAddress?: string };
  position?: { lat?: number; lon?: number };
};

async function geocodeLocation(query: string, apiKey: string) {
  const geocodeUrl = new URL(
    `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`,
  );
  geocodeUrl.searchParams.set("key", apiKey);
  geocodeUrl.searchParams.set("limit", "1");

  const response = await fetch(geocodeUrl);
  if (!response.ok) {
    throw new Error("TomTom geocoding failed");
  }

  const data = (await response.json()) as { results?: GeocodeResult[] };
  const match = data.results?.[0];
  if (
    !match?.position ||
    typeof match.position.lat !== "number" ||
    typeof match.position.lon !== "number"
  ) {
    throw new Error(`Location not found: ${query}`);
  }

  return {
    label: match.address?.freeformAddress || query,
    lat: match.position.lat,
    lon: match.position.lon,
  };
}

async function handleRouteRequest(request: Request, env: Env) {
  if (!env.TOMTOM_API_KEY) {
    return Response.json(
      { error: "TomTom routing is not configured yet." },
      { status: 503 },
    );
  }

  let body: { arriveAt?: unknown; end?: unknown; start?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const start = typeof body.start === "string" ? body.start.trim() : "";
  const end = typeof body.end === "string" ? body.end.trim() : "";
  const arriveAt = typeof body.arriveAt === "string" ? body.arriveAt : "";
  const arrivalDate = new Date(arriveAt);

  if (!start || !end || start.length > 240 || end.length > 240) {
    return Response.json(
      { error: "Enter a valid start and destination." },
      { status: 400 },
    );
  }
  if (!arriveAt || Number.isNaN(arrivalDate.getTime())) {
    return Response.json({ error: "Choose a valid arrival time." }, { status: 400 });
  }
  if (arrivalDate.getTime() <= Date.now()) {
    return Response.json(
      { error: "Choose an arrival time in the future." },
      { status: 400 },
    );
  }

  try {
    const [origin, destination] = await Promise.all([
      geocodeLocation(start, env.TOMTOM_API_KEY),
      geocodeLocation(end, env.TOMTOM_API_KEY),
    ]);
    const routeUrl = new URL(
      `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lon}:${destination.lat},${destination.lon}/json`,
    );
    routeUrl.searchParams.set("key", env.TOMTOM_API_KEY);
    routeUrl.searchParams.set("traffic", "true");
    routeUrl.searchParams.set("travelMode", "car");
    routeUrl.searchParams.set("routeType", "fastest");
    routeUrl.searchParams.set("routeRepresentation", "summaryOnly");
    routeUrl.searchParams.set("arriveAt", arrivalDate.toISOString());

    const response = await fetch(routeUrl);
    const data = (await response.json()) as {
      detailedError?: { message?: string };
      routes?: Array<{
        summary?: {
          arrivalTime?: string;
          departureTime?: string;
          lengthInMeters?: number;
          trafficDelayInSeconds?: number;
          travelTimeInSeconds?: number;
        };
      }>;
    };
    const summary = data.routes?.[0]?.summary;

    if (!response.ok || !summary?.departureTime || !summary.arrivalTime) {
      throw new Error(data.detailedError?.message || "No driving route was found.");
    }

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
    const message = error instanceof Error ? error.message : "No route was found.";
    return Response.json({ error: message }, { status: 502 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/route") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }
      return handleRouteRequest(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
