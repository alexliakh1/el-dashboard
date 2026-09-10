type GeocodeResult = {
  address?: {
    freeformAddress?: string;
    postalCode?: string;
    streetNumber?: string;
  };
  id?: string;
  poi?: { name?: string };
  position?: { lat?: number; lon?: number };
};

export async function handleSearchRequest(url: URL, env: { TOMTOM_API_KEY?: string }) {
  if (!env.TOMTOM_API_KEY) {
    return Response.json(
      { error: "TomTom search is not configured yet." },
      { status: 503 },
    );
  }

  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 3) {
    return Response.json({ suggestions: [] });
  }
  if (query.length > 160) {
    return Response.json({ error: "Search is too long." }, { status: 400 });
  }

  const searchUrl = new URL(
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`,
  );
  const numericPrefix = query.match(/^\d{1,8}/)?.[0] || "";
  searchUrl.searchParams.set("key", env.TOMTOM_API_KEY);
  searchUrl.searchParams.set("limit", numericPrefix ? "10" : "5");
  searchUrl.searchParams.set("typeahead", "true");
  searchUrl.searchParams.set("language", "en-US");
  searchUrl.searchParams.set("countrySet", "US");
  if (numericPrefix) {
    searchUrl.searchParams.set("idxSet", "PAD,Addr");
    if (/^\d+$/.test(query)) {
      // A house number alone is ambiguous nationwide. Bias numeric-only
      // searches toward the dashboard's Los Gatos / Monte Sereno area.
      searchUrl.searchParams.set("lat", "37.2358");
      searchUrl.searchParams.set("lon", "-121.9624");
      searchUrl.searchParams.set("radius", "50000");
    }
  }

  try {
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    const data = (await response.json()) as { results?: GeocodeResult[] };
    if (!response.ok) {
      return Response.json({ error: "Address search failed." }, { status: 502 });
    }

    const rankedResults = (data.results || []).map(function (result, index) {
      const address = result.address?.freeformAddress || "";
      const streetNumber =
        result.address?.streetNumber || address.match(/^(\d+[A-Za-z-]*)\b/)?.[1] || "";
      let rank = index;

      if (numericPrefix) {
        if (streetNumber === numericPrefix) {
          rank = 0;
        } else if (streetNumber.startsWith(numericPrefix)) {
          rank = 100 + index;
        } else if (address.startsWith(numericPrefix)) {
          rank = 200 + index;
        } else if (result.address?.postalCode?.startsWith(numericPrefix)) {
          rank = 500 + index;
        } else {
          rank = 300 + index;
        }
      }

      return { rank, result };
    });

    const suggestions = rankedResults
      .sort(function (a, b) {
        return a.rank - b.rank;
      })
      .map(function (item) {
        return item.result;
      })
      .filter(function (result) {
        return Boolean(result.address?.freeformAddress);
      })
      .slice(0, 5)
      .map(function (result, index) {
        const address = result.address?.freeformAddress || "";
        const name = result.poi?.name || "";
        return {
          id: result.id || `${index}-${address}`,
          label: name || address,
          secondary: name ? address : "",
          value: name ? `${name}, ${address}` : address,
        };
      });

    return Response.json({ suggestions });
  } catch {
    return Response.json({ error: "Address search failed." }, { status: 502 });
  }
}


