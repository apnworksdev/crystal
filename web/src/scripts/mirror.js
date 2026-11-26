// Mirror page. The camera is shown through still fluted glass by a WebGL shader (see
// FEEDBACK). The microphone moves only the logo (logo-motion.js), never the picture.
// Only this page loads this file. It needs no page-transition setup, because the
// mirror page has no router.

import { setLogoMic } from './logo-motion.js';

const root = document.querySelector('[data-mirror]');
const canvas = root.querySelector('[data-mirror-canvas]');
const video = root.querySelector('[data-mirror-video]');
const enterButton = root.querySelector('[data-mirror-enter]');
const status = root.querySelector('[data-mirror-status]');
const toggles = {
  audio: root.querySelector('[data-mirror-toggle="audio"]'),
  video: root.querySelector('[data-mirror-toggle="video"]'),
};

/* ---------- Shaders ---------- */

const VERTEX = `
attribute vec2 p;
varying vec2 v;
void main() {
  v = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}`;

// Fluted glass. The screen is cut into three upright bands with gently bowed seams. Each
// band looks at its own side of the camera (left, middle, right) through a window a
// little wider than its third, so a face repeats across the bands, shifted, the way it
// does behind reeded glass. The seams are soft: neighbouring bands cross-fade into each
// other instead of meeting at a line. It depends only on the camera picture: no time, no
// sound, so it never moves on its own.
const FEEDBACK = `${COMMON}
uniform sampler2D uCam;
uniform vec2 uCamRes;

const float BANDS = 3.0;
// How much of the camera's width each band shows. More than a third, so they overlap.
const float SPAN = 0.5;
// How far each band's view sits from the middle, per band: left, middle, right.
const float SPREAD = 0.24;
// How much the seams bow, both outwards in the middle and inwards at the top and bottom,
// mirrored, so the three bands each take a third of the screen on average.
const float BOW = 0.18;
// How wide each seam's cross-fade is, as a share of a band, on each side of the seam.
const float SOFT = 0.15;

vec3 cam(vec2 uv) {
  float s = (uRes.x / uRes.y) / (uCamRes.x / uCamRes.y);
  if (s > 1.0) uv.y = (uv.y - 0.5) / s + 0.5;
  else uv.x = (uv.x - 0.5) * s + 0.5;
  uv.x = 1.0 - uv.x;
  // Mirror at the edges instead of smearing the last pixel.
  uv = abs(mod(uv + 1.0, 2.0) - 1.0);
  return texture2D(uCam, uv).rgb;
}

// One band's picture. across runs 0 to 1 over the band (a little past it at a seam).
vec3 band(float k, float across, float y) {
  float lens = across - 0.5;
  // A gentle lens swells the middle of each band, as a glass rib does.
  lens *= 1.0 - 0.15 * (1.0 - 4.0 * clamp(lens * lens, 0.0, 0.25));
  float centre = 0.5 + (k - (BANDS - 1.0) * 0.5) * SPREAD;
  return cam(vec2(centre + lens * SPAN, 0.5 + y * 0.96));
}

void main() {
  float y = v.y - 0.5;
  // The seams bow away from the centre line, mirrored on both sides. 4y² - 1/3 averages
  // zero over the height, so each band is a third of the width on average.
  float d = (v.x - 0.5) * BANDS;
  float x = d * (1.0 + BOW * (4.0 * y * y - 1.0 / 3.0)) + BANDS * 0.5;
  float k = clamp(floor(x), 0.0, BANDS - 1.0);
  float across = x - k;
  vec3 col = band(k, across, y);

  // Soft seams: half and half on the seam, fading to the band's own picture SOFT away.
  if (k > 0.0 && across < SOFT) {
    float own = 0.5 + 0.5 * smoothstep(0.0, 1.0, across / SOFT);
    col = mix(band(k - 1.0, across + 1.0, y), col, own);
  }
  if (k < BANDS - 1.0 && across > 1.0 - SOFT) {
    float own = 0.5 + 0.5 * smoothstep(0.0, 1.0, (1.0 - across) / SOFT);
    col = mix(band(k + 1.0, across - 1.0, y), col, own);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// Finish: a touch more contrast and a soft dark edge. Still: no grain, no flash.
const DISPLAY = `${COMMON}
uniform sampler2D uTex;

void main() {
  vec3 c = texture2D(uTex, v).rgb;
  c = (c - 0.5) * 1.06 + 0.5;
  vec2 e = v - 0.5;
  c *= 1.0 - dot(e, e) * 0.35;
  gl_FragColor = vec4(c, 1.0);
}`;

/* ---------- WebGL ---------- */

let gl;
let feedbackProgram;
let displayProgram;
let camTexture;
let buffers = [];
let current = 0;
let width = 0;
let height = 0;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function program(fragment) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const { name } = gl.getActiveUniform(prog, i);
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, uniforms };
}

function texture() {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function setUpGL() {
  if (gl) return true;
  gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return false;
  try {
    feedbackProgram = program(FEEDBACK);
    displayProgram = program(DISPLAY);
  } catch (error) {
    console.error(error);
    gl = null;
    return false;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  camTexture = texture();
  return true;
}

function resize() {
  // Full CSS pixels, so the camera stays sharp. Not more, to keep phones cool.
  const scale = 1;
  const w = Math.max(2, Math.round(innerWidth * scale));
  const h = Math.max(2, Math.round(innerHeight * scale));
  if (w === width && h === height) return;
  width = w;
  height = h;
  canvas.width = w;
  canvas.height = h;

  buffers.forEach(({ tex, fbo }) => {
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
  });
  buffers = [0, 1].map(() => {
    const tex = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ---------- Audio ---------- */

let audioContext;
let analyser;
let audioSource;

/**
 * Creates and starts the audio context. Must run straight from a click: Safari keeps
 * a context created later (after the permission prompt) silent.
 */
function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
  } catch {
    // No Web Audio. The camera still works, just without sound.
  }
}

function connectAudio(stream) {
  unlockAudio();
  if (!audioContext) return;
  // Only the logo listens (logo-motion.js). Same settings as a project video's sound,
  // so both move the letters alike; fine enough to tell a low voice from a high one.
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -24;
  audioSource = audioContext.createMediaStreamSource(stream);
  audioSource.connect(analyser);
  setLogoMic(analyser);
}

function disconnectAudio() {
  audioSource?.disconnect();
  audioSource = null;
  analyser = null;
  setLogoMic(null);
}

/* ---------- Loop ---------- */

let frame = 0;
// The canvas fades in only once it holds a camera frame, so it never fades in black.
let showing = false;

function draw() {
  frame = requestAnimationFrame(draw);
  if (!gl || video.readyState < 2 || !video.videoWidth) return;
  resize();
  const write = buffers[1 - current];

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, camTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

  gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
  gl.viewport(0, 0, width, height);
  const f = feedbackProgram.uniforms;
  gl.useProgram(feedbackProgram.prog);
  gl.uniform1i(f.uCam, 0);
  gl.uniform2f(f.uRes, width, height);
  gl.uniform2f(f.uCamRes, video.videoWidth, video.videoHeight);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const d = displayProgram.uniforms;
  gl.useProgram(displayProgram.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, write.tex);
  gl.uniform1i(d.uTex, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  current = 1 - current;
  if (!showing) {
    showing = true;
    render();
  }
}

function syncLoop() {
  const running = tracks.video || tracks.audio;
  if (running && !frame && !document.hidden) frame = requestAnimationFrame(draw);
  if ((!running || document.hidden) && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/* ---------- Devices ---------- */

const tracks = { audio: null, video: null };

function say(message) {
  status.textContent = message;
}

function render() {
  const on = Boolean(tracks.audio || tracks.video);
  root.dataset.state = on ? 'live' : 'idle';
  root.dataset.camera = tracks.video && showing ? 'on' : 'off';
  enterButton.hidden = on;
  toggles.audio.setAttribute('aria-pressed', String(Boolean(tracks.audio)));
  toggles.video.setAttribute('aria-pressed', String(Boolean(tracks.video)));
  syncLoop();
}

function stop(kind) {
  const track = tracks[kind];
  if (!track) return;
  track.stop();
  tracks[kind] = null;
  if (kind === 'audio') disconnectAudio();
  if (kind === 'video') {
    video.srcObject = null;
    showing = false;
  }
}

function attach(stream) {
  const [videoTrack] = stream.getVideoTracks();
  const [audioTrack] = stream.getAudioTracks();

  if (videoTrack) {
    if (!setUpGL()) {
      videoTrack.stop();
      say('This browser can’t draw the mirror.');
    } else {
      tracks.video = videoTrack;
      video.srcObject = new MediaStream([videoTrack]);
      video.play().catch(() => {});
      videoTrack.addEventListener('ended', () => {
        tracks.video = null;
        showing = false;
        render();
      });
    }
  }

  if (audioTrack) {
    tracks.audio = audioTrack;
    connectAudio(new MediaStream([audioTrack]));
    audioTrack.addEventListener('ended', () => {
      tracks.audio = null;
      disconnectAudio();
      render();
    });
  }
}

const CONSTRAINTS = {
  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

/** Asks for the devices that are off. If both were asked and one is refused, tries each alone. */
async function request(kinds) {
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser can’t open the camera.');
    return;
  }
  // One request at a time: a second click while the browser is asking would open the device twice.
  if ('busy' in root.dataset) return;
  const wanted = kinds.filter((kind) => !tracks[kind]);
  if (!wanted.length) return;

  root.dataset.busy = '';
  try {
    const constraints = Object.fromEntries(wanted.map((kind) => [kind, CONSTRAINTS[kind]]));
    attach(await navigator.mediaDevices.getUserMedia(constraints));
  } catch {
    if (wanted.length > 1) {
      for (const kind of wanted) {
        try {
          attach(await navigator.mediaDevices.getUserMedia({ [kind]: CONSTRAINTS[kind] }));
        } catch {
          // Refused or missing. The other one may still work.
        }
      }
    }
    if (wanted.every((kind) => !tracks[kind])) {
      say('Camera and microphone access was refused. Allow it in the browser to enter.');
    }
  } finally {
    delete root.dataset.busy;
    render();
  }
}

function stopAll() {
  stop('audio');
  stop('video');
  render();
}

/* ---------- Controls ---------- */

enterButton.addEventListener('click', () => {
  unlockAudio();
  request(['video', 'audio']);
});

Object.entries(toggles).forEach(([kind, button]) => {
  button.addEventListener('click', () => {
    if (tracks[kind]) {
      stop(kind);
      render();
    } else {
      if (kind === 'audio') unlockAudio();
      request([kind]);
    }
  });
});

let leaving = false;

/**
 * The way out: the buttons sink and fade (the opening animation run backwards), the
 * camera image fades with them, then the page leaves. Resolves straight away with
 * reduced motion.
 */
function playLeave() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const easing = 'cubic-bezier(0.7, 0, 0.84, 0)';
  const bar = root.querySelector('.mirror__bar');
  const canvas = root.querySelector('[data-mirror-canvas]');
  const fade = { duration: 350, easing, fill: 'forwards' };
  canvas.animate([{ opacity: getComputedStyle(canvas).opacity }, { opacity: 0 }], fade);
  const out = bar.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 8px' }], fade);
  return out.finished.catch(() => {});
}

function close() {
  if (leaving) return;
  leaving = true;
  playLeave().then(leave);
}

function leave() {
  stopAll();
  let sameSite = false;
  try {
    sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin;
  } catch {
    // A bad referrer just means going home.
  }
  if (sameSite && history.length > 1) history.back();
  else location.assign('/');
}

root.querySelector('[data-mirror-close]').addEventListener('click', close);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') close();
});

document.addEventListener('visibilitychange', syncLoop);

// Release the camera when leaving, and start clean if the page comes back from cache.
addEventListener('pagehide', stopAll);
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  leaving = false;
  root.getAnimations({ subtree: true }).forEach((animation) => {
    if (animation instanceof CSSAnimation || animation instanceof CSSTransition) return;
    animation.cancel();
  });
  render();
});
