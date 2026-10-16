function getBrisbaneParts(value) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function getScheduledStartWallMinutes(job) {
  if (!job?.date || !/^\d{4}-\d{2}-\d{2}$/.test(job.date) ||
      !job.startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(job.startTime)) {
    return null;
  }

  const [year, month, day] = job.date.split('-').map(Number);
  const [hour, minute] = job.startTime.split(':').map(Number);
  const scheduledDate = new Date(Date.UTC(year, month - 1, day));
  if (scheduledDate.toISOString().slice(0, 10) !== job.date) return null;

  return Date.UTC(year, month - 1, day, hour, minute) / 60000;
}

function getBrisbaneWallMinutes(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getBrisbaneParts(date);
  const wholeMinutes = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute)
  ) / 60000;
  return wholeMinutes + Number(parts.second) / 60 + date.getUTCMilliseconds() / 60000;
}

function isClockInPastGracePeriod(job, now = new Date(), graceMinutes = 60) {
  const scheduledStart = getScheduledStartWallMinutes(job);
  const currentTime = getBrisbaneWallMinutes(now);
  if (scheduledStart === null || currentTime === null) return false;
  return currentTime > scheduledStart + graceMinutes;
}

module.exports = {
  getBrisbaneWallMinutes,
  getScheduledStartWallMinutes,
  isClockInPastGracePeriod
};
