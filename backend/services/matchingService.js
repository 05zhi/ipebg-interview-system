function mergeIntervals(intervals) {
  const sorted = intervals
    .map(({ starts_at, ends_at }) => ({ start: new Date(starts_at).getTime(), end: new Date(ends_at).getTime() }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a.start - b.start);
  return sorted.reduce((merged, current) => {
    const previous = merged.at(-1);
    if (previous && current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
    else merged.push({ ...current });
    return merged;
  }, []);
}

function intersectTwo(left, right) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (start < end) result.push({ start, end });
    if (left[i].end < right[j].end) i += 1;
    else j += 1;
  }
  return result;
}

function findCommonSlots(slotGroups, rangeStart, rangeEnd, durationMinutes = 30, stepMinutes = 30) {
  const lower = new Date(rangeStart).getTime();
  const upper = new Date(rangeEnd).getTime();
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return [];
  const groups = slotGroups.map((group) => mergeIntervals(group).map((interval) => ({
    start: Math.max(interval.start, lower),
    end: Math.min(interval.end, upper),
  })).filter(({ start, end }) => start < end));
  if (!groups.length || groups.some((group) => !group.length)) return [];
  const common = groups.slice(1).reduce(intersectTwo, groups[0]);
  const duration = durationMinutes * 60_000;
  const step = stepMinutes * 60_000;
  const results = [];
  for (const interval of common) {
    const firstStart = Math.ceil(interval.start / step) * step;
    for (let start = firstStart; start + duration <= interval.end; start += step) {
      results.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + duration).toISOString() });
    }
  }
  return results;
}

function localTime(isoString, timezone) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(isoString));
}

module.exports = { mergeIntervals, intersectTwo, findCommonSlots, localTime };
