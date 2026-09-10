// Gruppiert bestätigte Termine + manuelle Anpassungen nach Kalenderjahr.

function yearOf(dateKey) {
  return dateKey.split('-')[0];
}

// historyDates: string[] (YYYY-MM-DD), adjustments: { [dateKey]: netDelta }
export function getYearlyBreakdown(historyDates = [], adjustments = {}) {
  const years = new Set();
  historyDates.forEach((d) => years.add(yearOf(d)));
  Object.keys(adjustments).forEach((d) => years.add(yearOf(d)));

  const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));

  return sortedYears.map((year) => {
    const yearHistoryDates = historyDates
      .filter((d) => yearOf(d) === year)
      .sort((a, b) => (a < b ? 1 : -1));
    const yearAdjustments = Object.entries(adjustments)
      .filter(([d]) => yearOf(d) === year)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const adjustmentSum = yearAdjustments.reduce((sum, [, v]) => sum + v, 0);
    const total = yearHistoryDates.length + adjustmentSum;

    return { year, total, historyDates: yearHistoryDates, adjustments: yearAdjustments };
  });
}

export function getCurrentYearCount(historyDates = [], adjustments = {}) {
  const currentYear = String(new Date().getFullYear());
  const breakdown = getYearlyBreakdown(historyDates, adjustments);
  const entry = breakdown.find((b) => b.year === currentYear);
  return entry ? entry.total : 0;
}
