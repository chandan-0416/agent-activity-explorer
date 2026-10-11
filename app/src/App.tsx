// import { useEffect, useState } from "react";
// import "./App.css";

// type EventStatus = "ok" | "blocked" | "error";

// interface ActivityEvent {
//   id: string;
//   timestamp: string;
//   agent: string;
//   tool: string;
//   status: EventStatus;
//   latencyMs: number;
//   argsPreview: string;
// }

// interface EventsResponse {
//   items: ActivityEvent[];
//   nextCursor: string | null;
//   total: number;
// }

// const API_URL = "http://localhost:4000";
// console.log("API_URL/events?q=vector.search&limit=5");

// function App() {
//   const [events, setEvents] = useState<ActivityEvent[]>([]);
//   const [total, setTotal] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     const controller = new AbortController();

//     async function fetchEvents() {
//       try {
//         setLoading(true);
//         setError(null);

//         const response = await fetch(
//           `${API_URL}/events?limit=50`,
//           { signal: controller.signal },
//         );

//         if (!response.ok) {
//           throw new Error(`Request failed with status ${response.status}`);
//         }

//         const data: EventsResponse = await response.json();

//         setEvents(data.items);
//         setTotal(data.total);
//       } catch (err) {
//         if (err instanceof Error && err.name === "AbortError") {
//           return;
//         }

//         setError(
//           err instanceof Error
//             ? err.message
//             : "An unexpected error occurred.",
//         );
//       } finally {
//         if (!controller.signal.aborted) {
//           setLoading(false);
//         }
//       }
//     }

//     void fetchEvents();

//     return () => controller.abort();
//   }, []);

//   return (
//     <main className="app">
//       <header className="page-header">
//         <div>
//           <p className="eyebrow">MONITORING</p>
//           <h1>Agent Activity Explorer</h1>
//           <p className="subtitle">
//             Inspect tool calls and agent activity.
//           </p>
//         </div>

//         <div className="total-card">
//           <span>Total events</span>
//           <strong>{total.toLocaleString()}</strong>
//         </div>
//       </header>

//       <section className="table-section" aria-labelledby="events-heading">
//         <div className="section-header">
//           <h2 id="events-heading">Recent activity</h2>
//           <span>{events.length} events loaded</span>
//         </div>

//         {loading ? (
//           <p className="state-message" role="status">
//             Loading events…
//           </p>
//         ) : error ? (
//           <div className="state-message error" role="alert">
//             <p>Could not load events: {error}</p>
//             <button onClick={() => window.location.reload()}>
//               Retry
//             </button>
//           </div>
//         ) : events.length === 0 ? (
//           <p className="state-message">No events found.</p>
//         ) : (
//           <div className="table-wrapper">
//             <table>
//               <thead>
//                 <tr>
//                   <th scope="col">Timestamp</th>
//                   <th scope="col">Agent</th>
//                   <th scope="col">Tool</th>
//                   <th scope="col">Status</th>
//                   <th scope="col">Latency</th>
//                 </tr>
//               </thead>

//               <tbody>
//                 {events.map((event) => (
//                   <tr key={event.id}>
//                     <td>
//                       {new Date(event.timestamp).toLocaleString()}
//                     </td>
//                     <td>{event.agent}</td>
//                     <td>
//                       <code>{event.tool}</code>
//                     </td>
//                     <td>
//                       <span className={`status status-${event.status}`}>
//                         {event.status}
//                       </span>
//                     </td>
//                     <td>{event.latencyMs} ms</td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         )}
//       </section>
//     </main>
//   );
// }

// export default App;




import { useEffect, useState, type FormEvent } from "react";
import "./App.css";

type EventStatus = "ok" | "blocked" | "error";
type StatusFilter = "" | EventStatus;

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

interface Filters {
  q: string;
  agents: string[];
  status: StatusFilter;
}

const API_URL = "http://localhost:4000";

function readFiltersFromUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") ?? "";

  return {
    q: params.get("q") ?? "",
    agents: params.getAll("agent"),
    status:
      status === "ok" || status === "blocked" || status === "error"
        ? status
        : "",
  };
}

function buildUrl(filters: Filters): string {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);

  filters.agents.forEach((agent) => {
    params.append("agent", agent);
  });

  if (filters.status) params.set("status", filters.status);

  const query = params.toString();

  return (
    window.location.pathname +
    (query ? `?${query}` : "") +
    window.location.hash
  );
}

function App() {
  const [filters, setFilters] = useState<Filters>(readFiltersFromUrl);
  const [searchDraft, setSearchDraft] = useState(
    () => readFiltersFromUrl().q,
  );

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const agentKey = JSON.stringify(filters.agents);

  function applyFilters(nextFilters: Filters) {
    const nextUrl = buildUrl(nextFilters);
    const currentUrl =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    if (nextUrl !== currentUrl) {
      window.history.pushState({}, "", nextUrl);
    }

    setFilters(nextFilters);
  }

  // Keep the UI synchronized with browser Back and Forward.
  useEffect(() => {
    function handlePopState() {
      const nextFilters = readFiltersFromUrl();
      setFilters(nextFilters);
      setSearchDraft(nextFilters.q);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Load the available agent names.
  useEffect(() => {
    const controller = new AbortController();

    async function fetchAgents() {
      try {
        setAgentsError(null);

        const response = await fetch(`${API_URL}/agents`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const data: unknown = await response.json();

        // Accept either a plain array or an object containing "value".
        const list = Array.isArray(data)
          ? data
          : typeof data === "object" &&
              data !== null &&
              "value" in data
            ? data.value
            : null;

        if (
          !Array.isArray(list) ||
          !list.every((agent) => typeof agent === "string")
        ) {
          throw new Error("Unexpected response from the agents API.");
        }

        setAgents(list);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setAgentsError(
          err instanceof Error ? err.message : "Could not load agents.",
        );
      }
    }

    void fetchAgents();

    return () => controller.abort();
  }, []);

  // Fetch a new page of events whenever an applied filter changes.
  useEffect(() => {
    const controller = new AbortController();

    async function fetchEvents() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("limit", "50");

        if (filters.q) params.set("q", filters.q);

        const selectedAgents = JSON.parse(agentKey) as string[];

        selectedAgents.forEach((agent) => {
          params.append("agent", agent);
        });

        if (filters.status) params.set("status", filters.status);

        const response = await fetch(
          `${API_URL}/events?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const data: EventsResponse = await response.json();

        setEvents(data.items);
        setTotal(data.total);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error ? err.message : "An unexpected error occurred.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchEvents();

    return () => controller.abort();
  }, [filters.q, filters.status, agentKey]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    applyFilters({
      ...filters,
      q: searchDraft.trim(),
    });
  }

  function handleAgentsChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    const selectedAgents = Array.from(
      event.currentTarget.selectedOptions,
      (option) => option.value,
    );

    applyFilters({
      ...filters,
      agents: selectedAgents,
    });
  }

  function clearFilters() {
    const emptyFilters: Filters = {
      q: "",
      agents: [],
      status: "",
    };

    setSearchDraft("");
    applyFilters(emptyFilters);
  }

  const hasActiveFilters =
    Boolean(filters.q) ||
    filters.agents.length > 0 ||
    Boolean(filters.status);

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
          <span>Matching events</span>
          <strong>{total.toLocaleString()}</strong>
        </div>
      </header>

      <section className="filters-panel" aria-label="Event filters">
        <form className="search-form" onSubmit={handleSearchSubmit}>
          <label htmlFor="event-search">Search events</label>

          <div className="search-controls">
            <input
              id="event-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search agents, tools, or arguments..."
            />

            <button type="submit">Search</button>
          </div>
        </form>

        <div className="filter-control">
          <label htmlFor="agent-filter">Agent</label>

          <select
            id="agent-filter"
            multiple
            size={4}
            value={filters.agents}
            onChange={handleAgentsChange}
            aria-describedby="agent-help"
          >
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>

          <small id="agent-help">
            Select multiple agents with Ctrl-click on Windows.
          </small>

          {agentsError && (
            <small className="error-text" role="alert">
              Could not load agents: {agentsError}
            </small>
          )}
        </div>

        <div className="filter-control">
          <label htmlFor="status-filter">Status</label>

          <select
            id="status-filter"
            value={filters.status}
            onChange={(event) =>
              applyFilters({
                ...filters,
                status: event.target.value as StatusFilter,
              })
            }
          >
            <option value="">All statuses</option>
            <option value="ok">OK</option>
            <option value="blocked">Blocked</option>
            <option value="error">Error</option>
          </select>
        </div>

        <button
          className="clear-button"
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
        >
          Clear filters
        </button>
      </section>

      <section className="table-section" aria-labelledby="events-heading">
        <div className="section-header">
          <h2 id="events-heading">Recent activity</h2>
          <span>
            {events.length} events loaded
            {hasActiveFilters ? " · Filters applied" : ""}
          </span>
        </div>

        {loading ? (
          <p className="state-message" role="status">
            Loading events…
          </p>
        ) : error ? (
          <div className="state-message error" role="alert">
            <p>Could not load events: {error}</p>
            <button
              type="button"
              onClick={() => setFilters({ ...filters })}
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <p className="state-message">No events match these filters.</p>
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
                    <td>{new Date(event.timestamp).toLocaleString()}</td>
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