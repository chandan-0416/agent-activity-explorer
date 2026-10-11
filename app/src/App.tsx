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

interface EventDetails extends ActivityEvent {
  args: unknown;
  result: unknown;
  policyMatches: unknown[];
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

function readEventIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("event");
}


function buildUrl(filters: Filters, eventId?: string | null): string {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);

  filters.agents.forEach((agent) => {
    params.append("agent", agent);
  });

  if (filters.status) params.set("status", filters.status);

  if (eventId) params.set("event", eventId);

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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventDetails | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(readEventIdFromUrl);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsRetryCount, setDetailsRetryCount] = useState(0);
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
      const nextEventId = readEventIdFromUrl();

      setFilters(nextFilters);
      setSearchDraft(nextFilters.q);
      setSelectedEventId(nextEventId);
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


  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEvent(null);
      setDetailsError(null);
      setDetailsLoading(false);
      return;
    }

    const controller = new AbortController();

    async function fetchEventDetails() {
      try {
        setDetailsLoading(true);
        setDetailsError(null);
        setSelectedEvent(null);

        const response = await fetch(
          `${API_URL}/events/${encodeURIComponent(selectedEventId)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const data: EventDetails = await response.json();
        setSelectedEvent(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setDetailsError(
          err instanceof Error
            ? err.message
            : "Could not load event details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setDetailsLoading(false);
        }
      }
    }

    void fetchEventDetails();

    return () => controller.abort();
  }, [selectedEventId, detailsRetryCount]);

  useEffect(() => {
    if (!selectedEventId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const nextUrl = buildUrl(readFiltersFromUrl());

        window.history.pushState({}, "", nextUrl);
        setSelectedEventId(null);
        setSelectedEvent(null);
        setDetailsError(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEventId]);

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
        setNextCursor(data.nextCursor);
        setLoadMoreError(null);
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


  function openEventDetails(eventId: string) {
    const nextUrl = buildUrl(filters, eventId);

    window.history.pushState({}, "", nextUrl);
    setSelectedEventId(eventId);
  }

  async function loadMoreEvents() {
    if (!nextCursor || loadingMore) return;

    const controller = new AbortController();

    try {
      setLoadingMore(true);
      setLoadMoreError(null);

      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("cursor", nextCursor);

      if (filters.q) {
        params.set("q", filters.q);
      }

      filters.agents.forEach((agent) => {
        params.append("agent", agent);
      });

      if (filters.status) {
        params.set("status", filters.status);
      }

      const response = await fetch(
        `${API_URL}/events?${params.toString()}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data: EventsResponse = await response.json();

      setEvents((previousEvents) => {
        const existingIds = new Set(
          previousEvents.map((event) => event.id),
        );

        const newEvents = data.items.filter(
          (event) => !existingIds.has(event.id),
        );

        return [...previousEvents, ...newEvents];
      });

      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch (err) {
      setLoadMoreError(
        err instanceof Error
          ? err.message
          : "Could not load more events.",
      );
    } finally {
      setLoadingMore(false);
    }
  }


  function closeEventDetails() {
    const nextUrl = buildUrl(filters);

    window.history.pushState({}, "", nextUrl);
    setSelectedEventId(null);
    setSelectedEvent(null);
    setDetailsError(null);
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

                  <tr
                    key={event.id}
                    className="event-row"
                    tabIndex={0}
                    aria-label={`Open event ${event.id}`}
                    onClick={() => openEventDetails(event.id)}
                    onKeyDown={(keyboardEvent) => {
                      if (
                        keyboardEvent.key === "Enter" ||
                        keyboardEvent.key === " "
                      ) {
                        keyboardEvent.preventDefault();
                        openEventDetails(event.id);
                      }
                    }}
                  >
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

        {loadMoreError && (
          <div className="state-message error" role="alert">
            <p>Could not load more events: {loadMoreError}</p>
            <button
              type="button"
              onClick={loadMoreEvents}
              disabled={loadingMore}
            >
              Retry loading more
            </button>
          </div>
        )}

        {nextCursor && !loading && !error && (
          <div className="pagination-controls">
            <button
              type="button"
              onClick={loadMoreEvents}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading more…" : "Load more events"}
            </button>

            <p>
              Showing {events.length.toLocaleString()} of{" "}
              {total.toLocaleString()} matching events
            </p>
          </div>
        )}

      </section>

      {selectedEventId && (
        <div className="details-overlay">
          <aside
            className="details-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-heading"
          >
            <div className="details-header">
              <div>
                <p className="eyebrow">EVENT DETAILS</p>
                <h2 id="details-heading">Activity event</h2>
              </div>

              <button
                type="button"
                className="details-close"
                onClick={closeEventDetails}
                aria-label="Close event details"
              >
                Close
              </button>
            </div>

            {detailsLoading && (
              <p className="state-message" role="status">
                Loading event details…
              </p>
            )}

            {detailsError && (
              <div className="state-message error" role="alert">
                <p>Could not load event: {detailsError}</p>
                <button
                  type="button"
                  onClick={() => setDetailsRetryCount((count) => count + 1)}
                >
                  Retry
                </button>
              </div>
            )}

            {selectedEvent && (
              <div className="details-content">
                <dl className="details-metadata">
                  <dt>Event ID</dt>
                  <dd className="details-id">{selectedEvent.id}</dd>

                  <dt>Timestamp</dt>
                  <dd>
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </dd>

                  <dt>Agent</dt>
                  <dd>{selectedEvent.agent}</dd>

                  <dt>Tool</dt>
                  <dd>{selectedEvent.tool}</dd>

                  <dt>Status</dt>
                  <dd>
                    <span
                      className={`status status-${selectedEvent.status}`}
                    >
                      {selectedEvent.status}
                    </span>
                  </dd>

                  <dt>Latency</dt>
                  <dd>{selectedEvent.latencyMs} ms</dd>
                </dl>

                <h3>Arguments</h3>
                <pre>
                  {JSON.stringify(selectedEvent.args, null, 2)}
                </pre>

                <h3>Result</h3>
                <pre>
                  {JSON.stringify(selectedEvent.result, null, 2)}
                </pre>

                <h3>Policy matches</h3>
                <pre>
                  {JSON.stringify(selectedEvent.policyMatches, null, 2)}
                </pre>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

export default App;