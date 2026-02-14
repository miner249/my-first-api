const API_URL = window.location.origin;

export async function fetchTodayMatches() {
  const res = await fetch(`${API_URL}/api/today`);
  return res.json();
}

export async function fetchLiveMatches() {
  const res = await fetch(`${API_URL}/api/live`);
  return res.json();
}

export async function fetchMatchDetails(id) {
  const res = await fetch(`${API_URL}/api/match/${id}`);
  return res.json();
}

export function getMatchStatusLabel(match) {
  const status = match?.status;
  const statusTime = match?.status_time;

  if (status === 'Live' || status === 'IN_PLAY') {
    if (statusTime && statusTime.includes('Half')) return 'HALF TIME';
    return statusTime || status || 'Live';
  }

  if (status === 'Finished' || status === 'FINISHED') return 'FT';

  if (!status) return match?.start_time || 'TBD';

  return statusTime || status;
}
