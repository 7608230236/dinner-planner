function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = value => value * Math.PI / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Verified starter directory. Entries are only shown when reasonably close.
const VERIFIED_STORES = [
  {
    id: "verified-market-maven-pikesville",
    name: "Market Maven",
    address: "1630 Reisterstown Road, Pikesville, MD 21208",
    latitude: 39.3776,
    longitude: -76.7249,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Market+Maven+1630+Reisterstown+Road+Pikesville+MD+21208",
    websiteUrl: "https://marketmavenmd.com/",
    scopes: ["meat","supermarket"],
    verified: true
  },
  {
    id: "verified-seven-mile-pikesville",
    name: "Seven Mile Market",
    address: "201 Reisterstown Road, Pikesville, MD 21208",
    latitude: 39.3658,
    longitude: -76.7169,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Seven+Mile+Market+201+Reisterstown+Road+Pikesville+MD+21208",
    websiteUrl: "https://sevenmilemarket.com/",
    scopes: ["meat","supermarket"],
    verified: true
  }
];

const APPROVED_NAME_PATTERNS = [
  /\bkosher\b/i,
  /\bglatt\b/i,
  /\bmarket maven\b/i,
  /\bseven mile\b/i,
  /\b7 mile\b/i,
  /\bshalom kosher\b/i,
  /\bseasons\b/i,
  /\bevergreen\b/i,
  /\bgourmet glatt\b/i,
  /\bpomegranate\b/i,
  /\brockland kosher\b/i,
  /\bbingo\b/i,
  /\bbreadberry\b/i,
  /\bmoisha'?s\b/i,
  /\bwasserman\b/i,
  /\blemberger\b/i,
  /\bthe grove\b/i
];

function looksExplicitlyKosher(place) {
  const combined = [
    place.displayName?.text,
    place.formattedAddress,
    place.websiteUri
  ].filter(Boolean).join(" ");
  return APPROVED_NAME_PATTERNS.some(pattern => pattern.test(combined));
}

async function searchPlaces(apiKey, lat, lng, textQuery) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName.text",
        "places.formattedAddress",
        "places.googleMapsUri",
        "places.websiteUri",
        "places.location"
      ].join(",")
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 20,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 50000
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Store search failed");
  }
  return data.places || [];
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const scope = body.scope === "meat" ? "meat" : "supermarket";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: "Location is required" }, 400);
  }

  const seedStores = VERIFIED_STORES
    .filter(store => store.scopes.includes(scope))
    .map(store => ({
      ...store,
      distanceMiles: distanceMiles(lat, lng, store.latitude, store.longitude)
    }))
    .filter(store => store.distanceMiles <= 80);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  let googleStores = [];

  if (apiKey) {
    const queries = scope === "meat"
      ? ["kosher butcher near me", "kosher meat market near me", "kosher supermarket near me"]
      : ["kosher supermarket near me", "kosher grocery store near me"];

    try {
      const all = [];
      for (const query of queries) {
        all.push(...await searchPlaces(apiKey, lat, lng, query));
      }

      const seenGoogle = new Set();
      googleStores = all
        .filter(place => {
          if (!place.id || seenGoogle.has(place.id)) return false;
          seenGoogle.add(place.id);
          return looksExplicitlyKosher(place);
        })
        .map(place => {
          const placeLat = Number(place.location?.latitude);
          const placeLng = Number(place.location?.longitude);
          return {
            id: place.id,
            name: place.displayName?.text || "Store",
            address: place.formattedAddress || "",
            mapsUrl: place.googleMapsUri || "",
            websiteUrl: place.websiteUri || "",
            distanceMiles:
              Number.isFinite(placeLat) && Number.isFinite(placeLng)
                ? distanceMiles(lat, lng, placeLat, placeLng)
                : null,
            verified: false
          };
        });
    } catch {
      googleStores = [];
    }
  }

  const combined = [...seedStores, ...googleStores];
  const seen = new Set();
  const stores = combined
    .filter(store => {
      const key = `${store.name}|${store.address}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      // Local stores come first. Directory verification breaks ties only.
      const da = Number.isFinite(a.distanceMiles) ? a.distanceMiles : 999999;
      const db = Number.isFinite(b.distanceMiles) ? b.distanceMiles : 999999;
      if (da !== db) return da - db;
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    })
    .slice(0, 12);

  return json({ stores });
}