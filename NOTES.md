# Assignment - Agent Activity Explorer

### I chose React + Vite + TypeScript for this application
1. Lightweight & Fast Zero-overhead 
2. client-side architecture ideal
2. fast Hot Module Replacement (HMR)
3. Type Safety

### Core Requirements: Part A
- Event List & Pagination: Displays all tool calls (timestamp, agent, tool badge, status, latency) with cursor-based pagination to traverse the entire dataset without truncation.
- Search & Filters:Real-time free-text search across agents, tools, and arguments, coupled with multi-agent selection and status filtering.
- URL Synchronization: All active filters and currently opened event details sync bi-directionally with the URL query parameters. The view survives full page refreshes, works seamlessly with browser Back/Forward, and can be shared via copied link.
- Detail Slide-Over Drawer: Clicking any row opens a slide-over panel displaying the full event JSON. It is URL-linkable, fully accessible, and dismissible via the Escape key.
- Resilient States: Clear feedback for Loading, Empty, and Error states with retry controls, plus slow-network detection (>2s latency notices) to reassure users during API delays.

### Polish Items Completed
- Keyboard Navigation
- Responsive Layout
- Dark Mode
- Reduced Motion Respects
- Accessibility: Semantic HTML elements, ARIA attributes, focus rings, and tabular numerals.

### Tradeoffs & Future Work
- Multi-Select Filter: Built using standard accessible HTML 'select multiple' to avoid heavy external dependencies. With more time, a custom searchable chip/tag multi-select would enhance multi-agent selection on mobile.
- Virtualization: Currently utilizes cursor-based "Load more" appending. For 10,000+ client-rendered rows in a single session, a hand-rolled DOM virtualization window would keep memory and paint overhead minimal.

---

## AI Tooling Usage
AI assistance (ChatGPT) was utilized during development for:
1. Auditing the implementation against requirement in ASSIGNMENT.md.
2. Diagnosing and resolving a TypeScript closure narrowing edge-case in App.tsx.
3. Refining responsive CSS variables, accessible color contrasts, and keyboard focus states.