// Live incidents + planned maintenance from the City Metro Alerts Worker.
// The Trip Planner Worker pulls them through a service binding and translates them to planner line / station ids:
//   GET /api/alerts                    every active alert (+ maintenance starting within ~2 days)
//   GET /api/plan-alerts?from=&to=     alerts that touch each routing mode of a trip
// Every call fails quietly (returns nothing) so a problem on the Alerts side never breaks the map or planner.
import { api } from './api.js';
import { esc } from './ui.js';
import { lineStops } from './arrivals.js';

let cache = { at: 0, list: [] };

export async function loadAlerts(force = false) {
  if (!force && Date.now() - cache.at < 15000) return cache.list;
  try { const list = await api('/api/alerts'); cache = { at: Date.now(), list: Array.isArray(list) ? list : [] }; }
  catch { /* keep the last good list */ }
  return cache.list;
}

// { fastest: [...], fewest_transfers: [...], fewest_walking: [...] } — empty object when unavailable.
export async function loadPlanAlerts(fromId, toId) {
  try { const d = await api(`/api/plan-alerts?from_station=${fromId}&to_station=${toId}`); return (d && d.alerts) || {}; }
  catch { return {}; }
}

// Alerts that matter for one line: system-wide ones, ones on the line, and ones at any of its stops.
export function alertsForLine(list, lineId, net) {
  const stopIds = new Set(lineStops(lineId, net).map(s => s.id));
  return (list || []).filter(a => a.systemWide || (a.lineIds || []).includes(lineId) || (a.stationIds || []).some(id => stopIds.has(id)))
    .sort(byUrgency);
}

const RANK = { minor: 1, major: 2, critical: 3, emergency: 4 };
export const byUrgency = (x, y) => (x.phase === 'upcoming') - (y.phase === 'upcoming') || (RANK[y.level] || 0) - (RANK[x.level] || 0);

const when = t => (t ? new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const cap = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

function cardHtml(a) {
  const upcoming = a.phase === 'upcoming';
  const cls = upcoming ? 'upcoming' : a.kind === 'maintenance' ? 'info' : (RANK[a.level] || 1) >= 2 ? 'alert' : '';
  const tag = upcoming ? 'Planned maintenance' : a.kind === 'maintenance' ? 'Maintenance in progress' : `${cap(a.level || 'minor')} incident`;
  const detail = a.latest_update || a.description || '';
  const time = upcoming ? `Starts ${when(a.startTime)}${a.endTime ? ` · ends ${when(a.endTime)}` : ''}`
    : a.kind === 'maintenance' && a.endTime ? `Until ${when(a.endTime)}` : '';
  return `<div class="adv ${cls}" role="status"><small class="adv-tag">${esc(tag)}</small><strong>${esc(a.title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ''}${time ? `<p class="adv-time">${esc(time)}</p>` : ''}</div>`;
}

export const alertCards = list => (list || []).map(cardHtml).join('');
