const { pageSize, tickerIntervalMs, tickerVisibleRows, storageKey } = window.APP_CONFIG;

const grid = document.getElementById('agents');
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const topbar = document.querySelector('.topbar');
const backToTop = document.getElementById('back-to-top');
const progress = document.getElementById('read-progress');
const tickerToggle = document.getElementById('ticker-toggle');
const preview = document.getElementById('row-preview');
const scrollContext = document.getElementById('scroll-context');

window.ACTIVITY.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));

const callsPerMinute = new Map();
const agentCallCounts = {};

for (let i = 0; i < window.ACTIVITY.length; i++) {
  const event = window.ACTIVITY[i];
  const minute = event.timestamp.slice(11, 16);
  callsPerMinute.set(minute, (callsPerMinute.get(minute) || 0) + 1);
  agentCallCounts[event.agent] = (agentCallCounts[event.agent] || 0) + 1;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });
}

function renderAgents() {
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    const image = 'assets/agents/agent-' + String((index % 12) + 1).padStart(2, '0') + '.png';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">' + (agentCallCounts[agent.name] || 0).toLocaleString() + ' calls today</p>' +
      '</article>'
    );
  }).join('');
}

function loadViewed() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
}

function rememberViewed(items) {
  const viewed = loadViewed();
  const viewedSet = new Set(viewed);
  let changed = false;

  for (let i = 0; i < items.length; i++) {
    const id = items[i].id;
    if (!viewedSet.has(id)) {
      viewedSet.add(id);
      changed = true;
    }
  }

  if (changed) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(viewedSet)));
    } catch {
    }
  }
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return window.ACTIVITY;

  return window.ACTIVITY.filter((event) =>
    event.summary.toLowerCase().includes(needle) ||
    event.agent.toLowerCase().includes(needle) ||
    event.tool.toLowerCase().includes(needle) ||
    event.status.includes(needle)
  );
}

function renderResults(query) {
  const matches = search(query);
  const page = matches.slice(0, pageSize);
  const viewed = new Set(loadViewed());

  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  resultsList.innerHTML = page.map((event) => {
    const isNew = !viewed.has(event.id);
    return (
      '<li class="result-row status-' + event.status + '" data-id="' + event.id + '" data-minute="' + event.timestamp.slice(11, 16) + '">' +
      '<span class="result-time">' + formatTime(event.timestamp) + '</span>' +
      '<span class="result-agent">' + escapeHtml(event.agent) + '</span>' +
      '<span class="result-tool">' + escapeHtml(event.tool) + '</span>' +
      '<span class="result-status">' + event.status + '</span>' +
      '<span class="result-latency">' + event.latencyMs + ' ms</span>' +
      '<span class="result-summary">' + escapeHtml(event.summary) + '</span>' +
      (isNew ? '<span class="badge-new">New</span>' : '') +
      '</li>'
    );
  }).join('');

  rememberViewed(page);
}

let scrollTicking = false;
let currentFocusedRow = null;

function onScroll() {
  if (scrollTicking) return;
  scrollTicking = true;

  requestAnimationFrame(() => {
    const scrolled = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
    topbar.classList.toggle('topbar-raised', scrolled > 8);
    backToTop.classList.toggle('visible', scrolled > window.innerHeight);

    const midX = window.innerWidth / 2;
    const midY = window.innerHeight * 0.45;
    const elementAtMid = document.elementFromPoint(midX, midY);
    const candidateRow = elementAtMid ? elementAtMid.closest('.result-row') : null;

    if (candidateRow !== currentFocusedRow) {
      if (currentFocusedRow) currentFocusedRow.classList.remove('in-focus');
      if (candidateRow) candidateRow.classList.add('in-focus');
      currentFocusedRow = candidateRow;
    }

    if (currentFocusedRow) {
      const minute = currentFocusedRow.dataset.minute;
      const sameMinute = callsPerMinute.get(minute) || 0;
      scrollContext.textContent = minute + ' UTC · ' + sameMinute + ' calls that minute';
    } else {
      scrollContext.textContent = '';
    }

    scrollTicking = false;
  });
}

function hidePreview() {
  preview.hidden = true;
}

function showPreview(event) {
  const row = event.target.closest('.result-row');
  if (!row) return;
  const item = window.ACTIVITY.find((candidate) => candidate.id === row.dataset.id);
  if (!item) return;
  preview.textContent = item.summary;
  preview.style.top = event.clientY + 12 + 'px';
  preview.style.left = event.clientX + 12 + 'px';
  preview.hidden = false;
}

const renderedTickerRows = new Map();
let tickerPanel = null;
let tickerTimer = null;

function tickerRow(event) {
  if (renderedTickerRows.has(event.id)) {
    return renderedTickerRows.get(event.id).cloneNode(true);
  }
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';

  if (renderedTickerRows.size < 500) {
    renderedTickerRows.set(event.id, row);
  }
  return row.cloneNode(true);
}

function positionTicker() {
  if (!tickerPanel) return;
  tickerPanel.style.maxHeight = window.innerHeight - 120 + 'px';
}

function openTicker() {
  const panel = document.createElement('aside');
  panel.className = 'ticker';
  panel.innerHTML = '<header class="ticker-header">Live tool calls</header><ul class="ticker-list"></ul>';
  document.body.appendChild(panel);
  tickerPanel = panel;
  const list = panel.querySelector('.ticker-list');

  tickerTimer = setInterval(() => {
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  window.addEventListener('resize', positionTicker);
  window.addEventListener('keydown', handleTickerKeydown);
  positionTicker();
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function handleTickerKeydown(event) {
  if (event.key === 'Escape') closeTicker();
}

function closeTicker() {
  if (!tickerPanel) return;

  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
  }

  window.removeEventListener('resize', positionTicker);
  window.removeEventListener('keydown', handleTickerKeydown);
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

let searchDebounceTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderResults(searchInput.value);
  }, 180);
});

window.addEventListener('scroll', onScroll, { passive: true });
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview, { passive: true });
resultsList.addEventListener('touchstart', hidePreview, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();
renderResults('');
