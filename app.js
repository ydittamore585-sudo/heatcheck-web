/* HeatCheck Web — DOM wiring. Depends on lib.js (loaded first). */
'use strict';

(function () {
  var BUILD = '20261010a';

  var state = defaultSession();
  var pendingRelease = null; // video.currentTime at MARK RELEASE tap, or null
  var objectUrl = null;

  function $(id) { return document.getElementById(id); }

  var video, els;

  function currentVideoTime() {
    return video ? video.currentTime : 0;
  }

  // ---------- persistence ----------

  function persist() {
    saveSession({
      videoName: state.videoName,
      distanceFt: state.distanceFt,
      pitches: state.pitches,
    });
  }

  function restore() {
    var saved = loadSession();
    if (!saved) return;
    state.videoName = saved.videoName;
    state.distanceFt = saved.distanceFt;
    state.pitches = saved.pitches;
    els.distance.value = String(state.distanceFt);
    if (state.videoName) {
      els.videoHint.textContent = 'Last session: ' + state.videoName + ' — pick the file to continue.';
    }
  }

  // ---------- video ----------

  function loadVideoFile(file) {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    state.videoName = file.name;
    els.videoName.textContent = file.name;
    els.videoHint.textContent = '';
    pendingRelease = null;
    persist();
    renderPending();
  }

  function togglePlay() {
    if (!video.src) return;
    if (video.paused) video.play(); else video.pause();
  }

  function frameStep(dir) {
    if (!video.src) return;
    video.pause();
    // Seek by one frame; the browser lands on the nearest decodable frame.
    video.currentTime = Math.max(0, video.currentTime + dir * FRAME_STEP);
  }

  function setSpeed(rate) {
    if (video) video.playbackRate = rate;
    var btns = els.speedRow.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', Number(btns[i].dataset.rate) === rate);
    }
  }

  // ---------- marking ----------

  function markRelease() {
    if (!video.src) { flash('Load a video first'); return; }
    video.pause();
    pendingRelease = currentVideoTime();
    renderPending();
  }

  function markArrival() {
    if (!video.src) { flash('Load a video first'); return; }
    if (pendingRelease === null) { flash('Mark release first'); return; }
    video.pause();
    var arrival = currentVideoTime();
    var pitch = makePitch(pendingRelease, arrival, state.distanceFt);
    state.pitches = sortPitches(state.pitches.concat([pitch]));
    pendingRelease = null;
    persist();
    renderAll();
    var row = document.querySelector('[data-row="' + pitch.id + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function clearPending() {
    pendingRelease = null;
    renderPending();
  }

  function nudgePitch(id, field, dir) {
    var p = findPitch(state.pitches, id);
    if (!p) return;
    if (field !== 'release' && field !== 'arrival') return;
    p[field] = nudgeTime(p[field], dir);
    refreshPitch(p);
    persist();
    renderAll();
  }

  function deletePitch(id) {
    state.pitches = removePitch(state.pitches, id);
    persist();
    renderAll();
  }

  function clearAllPitches() {
    if (!state.pitches.length) return;
    if (!window.confirm('Delete all ' + state.pitches.length + ' marked pitches?')) return;
    state.pitches = [];
    pendingRelease = null;
    persist();
    renderAll();
  }

  function onDistanceChange() {
    var v = parseFloat(els.distance.value);
    if (isFinite(v) && v > 0) {
      state.distanceFt = v;
      persist();
    }
  }

  // ---------- rendering ----------

  function flash(msg) {
    els.flash.textContent = msg;
    els.flash.classList.add('show');
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(function () {
      els.flash.classList.remove('show');
    }, 1600);
  }

  function updateTimeDisplay() {
    els.timeDisplay.textContent = formatTapTime(currentVideoTime());
    els.playBtn.textContent = video.paused ? '▶' : '⏸';
  }

  function renderPending() {
    if (pendingRelease === null) {
      els.pending.textContent = 'Tap MARK RELEASE at the release frame, then MARK ARRIVAL at the mitt.';
      els.pending.classList.remove('armed');
      els.arrivalBtn.disabled = true;
    } else {
      els.pending.textContent = 'Release marked at ' + formatTapTime(pendingRelease) + ' — now mark arrival.';
      els.pending.classList.add('armed');
      els.arrivalBtn.disabled = false;
    }
  }

  function pitchRow(p, n) {
    var dtMs = Math.round((p.arrival - p.release) * 1000);
    var veloHtml = p.mph === null
      ? '<span class="bad">—</span>'
      : '<span class="mph">' + p.mph.toFixed(1) + '</span><span class="unit"> mph</span>';
    return (
      '<div class="prow" data-row="' + p.id + '">' +
        '<div class="pnum">#' + n + '</div>' +
        '<div class="pinfo">' +
          '<div class="pline">rel ' + formatTapTime(p.release) +
            ' <button class="mini" data-nudge="' + p.id + '|release|-1" title="release −1 frame">−1f</button>' +
            '<button class="mini" data-nudge="' + p.id + '|release|1" title="release +1 frame">+1f</button></div>' +
          '<div class="pline">arr ' + formatTapTime(p.arrival) +
            ' <button class="mini" data-nudge="' + p.id + '|arrival|-1" title="arrival −1 frame">−1f</button>' +
            '<button class="mini" data-nudge="' + p.id + '|arrival|1" title="arrival +1 frame">+1f</button></div>' +
          '<div class="pmeta">' + dtMs + ' ms · ' + p.distanceFt + ' ft' +
            (p.mph === null ? ' · <span class="bad">arrival ≤ release</span>' : '') + '</div>' +
        '</div>' +
        '<div class="pvelo">' + veloHtml + '</div>' +
        '<button class="del" data-del="' + p.id + '" title="delete">✕</button>' +
      '</div>'
    );
  }

  function renderList() {
    var sorted = sortPitches(state.pitches);
    if (!sorted.length) {
      els.list.innerHTML = '<div class="empty">No pitches marked yet.</div>';
    } else {
      els.list.innerHTML = sorted.map(function (p, i) { return pitchRow(p, i + 1); }).join('');
    }
    var stats = pitchStats(sorted);
    if (!stats.count) {
      els.stats.textContent = sorted.length
        ? sorted.length + ' marked, none with a usable velocity yet.'
        : 'Mark release + arrival on a pitch to get a velocity.';
    } else {
      els.stats.textContent =
        stats.count + ' pitch' + (stats.count === 1 ? '' : 'es') +
        ' · avg ' + stats.avg.toFixed(1) + ' mph' +
        ' · median ' + stats.median.toFixed(1) + ' mph';
    }
  }

  function renderLastVelo() {
    var sorted = sortPitches(state.pitches);
    var last = null;
    for (var i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].mph !== null) { last = sorted[i]; break; }
    }
    if (!last) {
      els.veloBig.textContent = '—';
      els.veloDetail.textContent = 'No velocity yet.';
      return;
    }
    els.veloBig.textContent = last.mph.toFixed(1);
    els.veloDetail.textContent =
      formatTapTime(last.release) + ' → ' + formatTapTime(last.arrival) +
      ' · ' + Math.round((last.arrival - last.release) * 1000) + ' ms · ' + last.distanceFt + ' ft';
  }

  function renderAll() {
    renderPending();
    renderList();
    renderLastVelo();
  }

  // ---------- footer (web build convention) ----------

  function wireFooter() {
    var tag = $('build-tag');
    if (tag) {
      tag.textContent = 'build ' + BUILD;
      try { tag.href = location.pathname + '?fresh=' + Date.now(); } catch (e) {}
    }
    var rb = $('btn-refresh');
    if (rb) rb.addEventListener('click', function () {
      location.replace(location.pathname + '?fresh=' + Date.now());
    });
  }

  // ---------- init ----------

  function init() {
    els = {
      fileInput: $('file-input'),
      video: $('video'),
      videoName: $('video-name'),
      videoHint: $('video-hint'),
      playBtn: $('btn-play'),
      backBtn: $('btn-back'),
      fwdBtn: $('btn-fwd'),
      timeDisplay: $('time-display'),
      speedRow: $('speed-row'),
      releaseBtn: $('btn-release'),
      arrivalBtn: $('btn-arrival'),
      clearPendingBtn: $('btn-clear-pending'),
      pending: $('pending'),
      flash: $('flash'),
      distance: $('distance'),
      veloBig: $('velo-big'),
      veloDetail: $('velo-detail'),
      list: $('pitch-list'),
      stats: $('stats-line'),
      clearAllBtn: $('btn-clear-all'),
    };
    video = els.video;

    els.fileInput.addEventListener('change', function () {
      loadVideoFile(els.fileInput.files && els.fileInput.files[0]);
      els.fileInput.value = '';
    });
    els.playBtn.addEventListener('click', togglePlay);
    els.backBtn.addEventListener('click', function () { frameStep(-1); });
    els.fwdBtn.addEventListener('click', function () { frameStep(1); });
    els.releaseBtn.addEventListener('click', markRelease);
    els.arrivalBtn.addEventListener('click', markArrival);
    els.clearPendingBtn.addEventListener('click', clearPending);
    els.clearAllBtn.addEventListener('click', clearAllPitches);
    els.distance.addEventListener('change', onDistanceChange);

    var speedBtns = els.speedRow.querySelectorAll('button');
    for (var i = 0; i < speedBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { setSpeed(Number(btn.dataset.rate)); });
      })(speedBtns[i]);
    }

    els.list.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.dataset && t.dataset.nudge) {
        var parts = t.dataset.nudge.split('|');
        nudgePitch(parts[0], parts[1], Number(parts[2]));
      } else if (t && t.dataset && t.dataset.del) {
        deletePitch(t.dataset.del);
      }
    });

    // Smooth time display while playing.
    function tick() {
      updateTimeDisplay();
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(tick);
      }
    }
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(tick);
    } else {
      video.addEventListener('timeupdate', updateTimeDisplay);
    }
    video.addEventListener('play', updateTimeDisplay);
    video.addEventListener('pause', updateTimeDisplay);
    video.addEventListener('seeked', updateTimeDisplay);

    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.code === 'Space') { ev.preventDefault(); togglePlay(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); frameStep(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); frameStep(1); }
      else if (ev.key === 'r' || ev.key === 'R') { markRelease(); }
      else if (ev.key === 'a' || ev.key === 'A') { markArrival(); }
    });

    restore();
    setSpeed(1);
    renderAll();
    updateTimeDisplay();
    wireFooter();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
