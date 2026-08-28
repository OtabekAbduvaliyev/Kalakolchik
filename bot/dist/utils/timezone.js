"use strict";
// ----------------------------------------------------------------
// Timezone helpers
// Default is Asia/Tashkent until per-user timezone exists.
// ----------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIMEZONE = void 0;
exports.getZonedParts = getZonedParts;
exports.todayInTimeZone = todayInTimeZone;
exports.timeInTimeZone = timeInTimeZone;
exports.nowContext = nowContext;
exports.zonedWallTimeToUtc = zonedWallTimeToUtc;
exports.formatLongDate = formatLongDate;
exports.endOfDateInTimeZone = endOfDateInTimeZone;
exports.DEFAULT_TIMEZONE = "Asia/Tashkent";
function pad(n) {
    return String(n).padStart(2, "0");
}
function getZonedParts(date, timeZone) {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    const raw = Object.fromEntries(fmt.formatToParts(date)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]));
    let hour = Number(raw.hour);
    if (hour === 24)
        hour = 0;
    const year = Number(raw.year);
    const month = Number(raw.month);
    const day = Number(raw.day);
    const minute = Number(raw.minute);
    return {
        year,
        month,
        day,
        hour,
        minute,
        date: `${year}-${pad(month)}-${pad(day)}`,
        time: `${pad(hour)}:${pad(minute)}`,
    };
}
function todayInTimeZone(timeZone) {
    return getZonedParts(new Date(), timeZone).date;
}
function timeInTimeZone(date, timeZone) {
    return getZonedParts(date, timeZone).time;
}
function nowContext(timeZone) {
    const parts = getZonedParts(new Date(), timeZone);
    return { date: parts.date, time: parts.time, iso: new Date().toISOString() };
}
/**
 * Interpret YYYY-MM-DD + HH:MM as wall-clock time in `timeZone`, return a UTC Date.
 */
function zonedWallTimeToUtc(dateYmd, timeHm, timeZone) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeHm);
    if (!dateMatch || !timeMatch)
        return null;
    const y = Number(dateMatch[1]);
    const mo = Number(dateMatch[2]);
    const d = Number(dateMatch[3]);
    const h = Number(timeMatch[1]);
    const mi = Number(timeMatch[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59)
        return null;
    let utc = Date.UTC(y, mo - 1, d, h, mi, 0);
    for (let i = 0; i < 3; i++) {
        const parts = getZonedParts(new Date(utc), timeZone);
        const wanted = Date.UTC(y, mo - 1, d, h, mi, 0);
        const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
        utc += wanted - got;
    }
    return new Date(utc);
}
const UZ_MONTHS = [
    "yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"
];
function formatLongDate(ymd, timeZone) {
    const dt = zonedWallTimeToUtc(ymd, "12:00", timeZone);
    if (!dt)
        return ymd;
    const parts = getZonedParts(dt, timeZone);
    const monthName = UZ_MONTHS[parts.month - 1] ?? "";
    return `${parts.day}-${monthName}, ${parts.year}`;
}
function endOfDateInTimeZone(ymd, timeZone) {
    return zonedWallTimeToUtc(ymd, "23:59", timeZone);
}
