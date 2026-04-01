export interface FlightStatusResult {
  flightStatus: string | null;
  estimatedArrival: string | null;
}

export async function fetchFlightStatus(flightNumber: string): Promise<FlightStatusResult> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;

  if (!apiKey) {
    console.error("[aviation] Missing AVIATIONSTACK_API_KEY env var");
    return { flightStatus: null, estimatedArrival: null };
  }

  try {
    // NOTE: free tier does not support HTTPS — must use HTTP
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${flightNumber}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[aviation] API request failed: HTTP ${res.status}`);
      return { flightStatus: null, estimatedArrival: null };
    }

    const json = await res.json();

    if (json.error) {
      console.error("[aviation] API returned error:", json.error);
      return { flightStatus: null, estimatedArrival: null };
    }

    if (!json.data?.length) {
      return { flightStatus: null, estimatedArrival: null };
    }

    const flight = json.data[0];
    return {
      flightStatus: flight.flight_status ?? null,
      // Prefer estimated arrival; fall back to scheduled if estimate not yet available
      estimatedArrival: flight.arrival?.estimated ?? flight.arrival?.scheduled ?? null,
    };
  } catch (err) {
    console.error("[aviation] fetchFlightStatus error:", err);
    return { flightStatus: null, estimatedArrival: null };
  }
}
