const parseLocalDateString = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const [year, month, day] = dateString.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const buildOrderDateQuery = (startDate, endDate) => {
  const dateQuery = {};
  if (startDate) {
    const parsedStart = parseLocalDateString(startDate);
    if (parsedStart) {
      dateQuery.$gte = parsedStart.toISOString();
    }
  }
  if (endDate) {
    const parsedEnd = parseLocalDateString(endDate);
    if (parsedEnd) {
      parsedEnd.setHours(23, 59, 59, 999);
      dateQuery.$lte = parsedEnd.toISOString();
    }
  }
  return Object.keys(dateQuery).length ? dateQuery : null;
};

const d = new Date();
const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
const y = today.getFullYear();
const m = ('0' + (today.getMonth() + 1)).slice(-2);
const day = ('0' + today.getDate()).slice(-2);
const todayStr = `${y}-${m}-${day}`;
const q = buildOrderDateQuery(todayStr, todayStr);
console.log('today', todayStr);
console.log('query', q);
const sample = new Date(today.getTime() + 23 * 60 * 60 * 1000 + 23 * 60 * 1000).toISOString();
console.log('sample', sample);
console.log('gte', sample >= q['$gte'], 'lte', sample <= q['$lte']);
