// A file video and a Vimeo embed behind one set of controls.
// Vimeo is driven with postMessage so the page does not ship the player library.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createFilePlayback(video) {
  const listeners = new Set();
  const snapshot = () => ({
    playing: !video.paused && !video.ended,
    current: video.currentTime || 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
  });
  const emit = () => {
    const state = snapshot();
    listeners.forEach((listener) => listener(state));
  };

  for (const type of ['play', 'pause', 'timeupdate', 'durationchange', 'ended']) {
    video.addEventListener(type, emit);
  }

  return {
    play: () => video.play(),
    pause: () => video.pause(),
    toggle: () => (video.paused || video.ended ? video.play() : video.pause()),
    seek(ratio) {
      if (!Number.isFinite(video.duration)) return;
      video.currentTime = clamp(ratio, 0, 1) * video.duration;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    destroy() {
      video.pause();
      listeners.clear();
    },
  };
}

export function createVimeoPlayback(frame) {
  const listeners = new Set();
  let playing = false;
  let current = 0;
  let duration = 0;
  let ready = false;
  const queued = [];

  const snapshot = () => ({ playing, current, duration });
  const emit = () => {
    const state = snapshot();
    listeners.forEach((listener) => listener(state));
  };

  const post = (method, value) => {
    frame.contentWindow?.postMessage(JSON.stringify({ method, value }), '*');
  };

  const send = (method, value) => {
    if (!ready) {
      queued.push([method, value]);
      return;
    }
    post(method, value);
  };

  const onMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    let message = event.data;
    if (typeof message === 'string') {
      try {
        message = JSON.parse(message);
      } catch {
        return;
      }
    }
    if (!message || typeof message !== 'object') return;

    if (message.event === 'ready') {
      ready = true;
      for (const name of ['play', 'pause', 'timeupdate', 'playProgress', 'ended', 'finish']) {
        post('addEventListener', name);
      }
      queued.splice(0).forEach(([method, value]) => post(method, value));
      return;
    }

    if (message.event === 'play') playing = true;
    if (message.event === 'pause' || message.event === 'ended' || message.event === 'finish' || message.event === 'error') {
      playing = false;
    }
    if ((message.event === 'timeupdate' || message.event === 'playProgress') && message.data) {
      current = message.data.seconds ?? current;
      duration = message.data.duration ?? duration;
    }
    if (message.event) emit();
  };

  window.addEventListener('message', onMessage);

  return {
    play: () => send('play'),
    pause: () => send('pause'),
    toggle() {
      send(playing ? 'pause' : 'play');
    },
    seek(ratio) {
      if (!duration) return;
      send('setCurrentTime', clamp(ratio, 0, 1) * duration);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    destroy() {
      window.removeEventListener('message', onMessage);
      if (ready) post('pause');
      listeners.clear();
    },
  };
}
