import { useEffect, useState } from "react";
import "./App.css";

type EventStatus = "ok" | "blocked" | "error";

interface ActivityEvent {
  id: string;
  timestamp: string;
  agent: string;
  tool: string;
  status: EventStatus;
  latencyMs: number;
  argsPreview: string;
}

interface EventsResponse {
  items: ActivityEvent[];
  nextCursor: string | null;
  total: number;
}

const API_URL = "http://localhost:4000";

function App() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchEvents() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_URL}/events?limit=50`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data: EventsResponse = await response.json();

        setEvents(data.items);
        setTotal(data.total);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchEvents();

    return () => controller.abort();
  }, []);

  return (
    <main className="app">
      <header className="page-header">
        <div>
          <p className="eyebrow">MONITORING</p>
          <h1>Agent Activity Explorer</h1>
          <p className="subtitle">
            Inspect tool calls and agent activity.
          </p>
        </div>

        <div className="total-card">
          <span>Total events</span>
          <strong>{total.toLocaleString()}</strong>
        </div>
      </header>

      <section className="table-section" aria-labelledby="events-heading">
        <div className="section-header">
          <h2 id="events-heading">Recent activity</h2>
          <span>{events.length} events loaded</span>
        </div>

        {loading ? (
          <p className="state-message" role="status">
            Loading events…
          </p>
        ) : error ? (
          <div className="state-message error" role="alert">
            <p>Could not load events: {error}</p>
            <button onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <p className="state-message">No events found.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Tool</th>
                  <th scope="col">Status</th>
                  <th scope="col">Latency</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td>{event.agent}</td>
                    <td>
                      <code>{event.tool}</code>
                    </td>
                    <td>
                      <span className={`status status-${event.status}`}>
                        {event.status}
                      </span>
                    </td>
                    <td>{event.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;