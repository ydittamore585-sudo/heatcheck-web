/* HeatCheck Web — pure logic, no DOM.
 *
 * Ported from the desktop app's film-review logic
 * (pitch_analyzer/client/src/lib/filmReview.ts) plus the velocity math
 * from the game-film dissection (55.5 ft / (frames/59.94) -> mph).
 *
 * Runs as a classic <script> in the browser and under node for tests
 * (see the module.exports guard at the bottom).
 */
'use strict';

/** One video frame — the nudge step for fine alignment. */
var FRAME_STEP = 1 / 60;

/** ft/s -> mph. */
var FT_S_TO_MPH = 3600 / 5280;

var STORAGE_KEY = 'heatcheck.web.v1';

/** Default release-point distance, feet. 14U mound is 54 ft; release ~3 ft in front. */
var DEFAULT_DISTANCE_FT = 51;

function makeId() {
  return 'p-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xffff).toString(36);
}

/** "m:ss.mmm" — e.g. 619.016 -> "10:19.016". */
function formatTapTime(seconds) {
  var clamped = Math.max(0, seconds);
  var totalMs = Math.round(clamped * 1000);
  var ms = totalMs % 1000;
  var totalS = Math.floor(totalMs / 1000);
  var s = totalS % 60;
  var m = Math.floor(totalS / 60);
  return m + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}

/**
 * Velocity in mph for a pitch, or null when the marks are unusable
 * (arrival at or before release).
 */
function calcMph(distanceFt, releaseS, arrivalS) {
  var dt = arrivalS - releaseS;
  if (!(dt > 0) || !(distanceFt > 0)) return null;
  return (distanceFt / dt) * FT_S_TO_MPH;
}

function makePitch(releaseS, arrivalS, distanceFt) {
  return {
    id: makeId(),
    release: releaseS,
    arrival: arrivalS,
    distanceFt: distanceFt,
    mph: calcMph(distanceFt, releaseS, arrivalS),
  };
}

/** Recompute mph after a nudge or distance change. */
function refreshPitch(p) {
  p.mph = calcMph(p.distanceFt, p.release, p.arrival);
  return p;
}

/** Shift a timestamp by whole frames, never below 0. */
function nudgeTime(t, frames) {
  return Math.max(0, t + frames * FRAME_STEP);
}

/** Chronological by release; stable for equal times. */
function sortPitches(pitches) {
  return pitches.slice().sort(function (a, b) { return a.release - b.release; });
}

function removePitch(pitches, id) {
  return pitches.filter(function (p) { return p.id !== id; });
}

function findPitch(pitches, id) {
  for (var i = 0; i < pitches.length; i++) {
    if (pitches[i].id === id) return pitches[i];
  }
  return null;
}

function median(values) {
  if (!values.length) return null;
  var s = values.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Stats over pitches with a usable mph. */
function pitchStats(pitches) {
  var velos = pitches
    .map(function (p) { return p.mph; })
    .filter(function (v) { return typeof v === 'number' && isFinite(v); });
  if (!velos.length) return { count: 0, avg: null, median: null };
  var sum = velos.reduce(function (a, b) { return a + b; }, 0);
  return { count: velos.length, avg: sum / velos.length, median: median(velos) };
}

function validSessionShape(s) {
  return (
    s &&
    typeof s === 'object' &&
    typeof s.videoName === 'string' &&
    typeof s.distanceFt === 'number' &&
    Array.isArray(s.pitches)
  );
}

function sanitizePitch(p) {
  if (!p || typeof p.id !== 'string') return null;
  var release = Number(p.release);
  var arrival = Number(p.arrival);
  var distanceFt = Number(p.distanceFt);
  if (!isFinite(release) || !isFinite(arrival) || !isFinite(distanceFt)) return null;
  return refreshPitch({
    id: p.id,
    release: Math.max(0, release),
    arrival: Math.max(0, arrival),
    distanceFt: distanceFt,
  });
}

function defaultSession() {
  return { videoName: '', distanceFt: DEFAULT_DISTANCE_FT, pitches: [] };
}

function getBrowserStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (e) {}
  return null;
}

function saveSession(session, storage) {
  var store = storage || getBrowserStorage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch (e) {
    return false; // full or unavailable — session stays in memory
  }
}

function loadSession(storage) {
  var store = storage || getBrowserStorage();
  if (!store) return null;
  try {
    var raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!validSessionShape(parsed)) return null;
    var pitches = [];
    for (var i = 0; i < parsed.pitches.length; i++) {
      var clean = sanitizePitch(parsed.pitches[i]);
      if (clean) pitches.push(clean);
    }
    return {
      videoName: parsed.videoName,
      distanceFt: parsed.distanceFt > 0 ? parsed.distanceFt : DEFAULT_DISTANCE_FT,
      pitches: sortPitches(pitches),
    };
  } catch (e) {
    return null;
  }
}

function clearSession(storage) {
  var store = storage || getBrowserStorage();
  if (!store) return;
  try { store.removeItem(STORAGE_KEY); } catch (e) {}
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FRAME_STEP: FRAME_STEP,
    FT_S_TO_MPH: FT_S_TO_MPH,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_DISTANCE_FT: DEFAULT_DISTANCE_FT,
    makeId: makeId,
    formatTapTime: formatTapTime,
    calcMph: calcMph,
    makePitch: makePitch,
    refreshPitch: refreshPitch,
    nudgeTime: nudgeTime,
    sortPitches: sortPitches,
    removePitch: removePitch,
    findPitch: findPitch,
    median: median,
    pitchStats: pitchStats,
    saveSession: saveSession,
    loadSession: loadSession,
    clearSession: clearSession,
    defaultSession: defaultSession,
  };
}
