// Mirror page. The camera is turned into a kaleidoscope with rainbow fringes by a
// WebGL shader. Lows, mids, highs and beats each move it differently (see FEEDBACK).
// Only this page loads this file. It needs no page-transition setup, because the
// mirror page has no router.

const root = document.querySelector('[data-mirror]');
const canvas = root.querySelector('[data-mirror-canvas]');
const video = root.querySelector('[data-mirror-video]');
const enterButton = root.querySelector('[data-mirror-enter]');
const status = root.querySelector('[data-mirror-status]');
const toggles = {
  audio: root.querySelector('[data-mirror-toggle="audio"]'),
  video: root.querySelector('[data-mirror-toggle="video"]'),
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// The kaleidoscope. The screen is cut into mirrored wedges around the centre and
// every wedge shows a fan of the camera image, sharp and in its real colours, so you
// can still pick yourself out in the repeats. Light breaks into rainbow fringes, as it
// does through glass: red, green and blue are each bent a little differently.
//
// Each part of the sound moves it its own way:
// low (bass)    more wedges, and the rainbow splits in and out from the centre
// mid (voice)   spins it, ripples the rings, and swirls the rainbow around the circle
// high          the rainbow shimmers in fine, fast grains
// beat          a rainbow ring shoots out from the centre, with a zoom, a flash and a short trail
const FEEDBACK = `${COMMON}
uniform sampler2D uCam;
uniform sampler2D uPrev;
uniform vec2 uCamRes;
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform float uBeatAge;
uniform float uSpin;
uniform float uMotion;

const float PI = 3.1415927;
const float TAU = 6.2831853;

vec3 cam(vec2 uv) {
  float s = (uRes.x / uRes.y) / (uCamRes.x / uCamRes.y);
  if (s > 1.0) uv.y = (uv.y - 0.5) / s + 0.5;
  else uv.x = (uv.x - 0.5) * s + 0.5;
  uv.x = 1.0 - uv.x;
  // Mirror at the edges instead of smearing the last pixel.
  uv = abs(mod(uv + 1.0, 2.0) - 1.0);
  return texture2D(uCam, uv).rgb;
}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

// Screen point (centred, aspect corrected) to camera position.
vec2 kaleido(vec2 p) {
  float aspect = uRes.x / uRes.y;
  float segments = 6.0 + 2.0 * floor(uLow * 3.0);
  float wedge = TAU / segments;
  float r = length(p);
  float a = atan(p.y, p.x) + uSpin;
  // Fold into one mirrored wedge: f runs 0 to 1 and back across each wedge.
  float f = abs(mod(a, wedge) - wedge * 0.5) / (wedge * 0.5);
  // Each wedge shows a fan of the camera that starts below the middle of the frame
  // and points up, so a face in the middle fits inside it instead of a thin sliver.
  float angle = PI * 0.5 + (f - 0.5) * 1.3;
  // Rings ripple outwards with the mids.
  r += sin(r * 14.0 - uTime * 3.0) * (0.003 + uMid * 0.035) * uMotion;
  // Beats punch the zoom in, then it eases back.
  float punch = exp(-uBeatAge * 6.0) * 0.18 * uMotion;
  float zoom = 1.25 - punch + sin(uTime * 0.2) * 0.06;
  return vec2(0.5, 0.1) + vec2(cos(angle), sin(angle)) * r * zoom * vec2(1.0 / aspect, 1.0);
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (v - 0.5) * vec2(aspect, 1.0);
  float r = length(p);

  // The ring a beat sends out: it travels from the centre to the edge and fades.
  float ringRadius = uBeatAge * 1.1;
  float ring = exp(-pow((r - ringRadius) * 9.0, 2.0)) * max(0.0, 1.0 - uBeatAge * 1.4);

  // How far apart the colours are pulled, each by its own part of the sound.
  float radial = (0.012 + uLow * 0.05 + ring * 0.09) * uMotion;
  float swirl = uMid * 0.1 * uMotion;
  vec2 grain = vec2(noise(p * 40.0 + uTime * 9.0), noise(p * 40.0 - uTime * 7.0 + 5.3)) - 0.5;
  vec2 shimmer = grain * uHigh * 0.08 * uMotion;

  // Red bends least, blue most.
  vec3 col;
  for (int i = 0; i < 3; i++) {
    float k = float(i) - 1.0;
    vec2 q = rotate(p, swirl * k) * (1.0 - radial * k) + shimmer * k;
    vec3 c = cam(kaleido(q));
    if (i == 0) col.r = c.r;
    else if (i == 1) col.g = c.g;
    else col.b = c.b;
  }

  // Beats leave a short, slightly zoomed trail.
  float beat = exp(-uBeatAge * 4.0);
  vec2 pp = (v - 0.5) * (0.99 - beat * 0.02) + 0.5;
  vec3 prev = texture2D(uPrev, pp).rgb;
  float keep = clamp(0.1 + beat * 0.45, 0.0, 0.6);
  gl_FragColor = vec4(mix(col, prev, keep), 1.0);
}`;

// Light finish: a touch more contrast, a cool cast, a soft dark edge and grain.
// Beats flash it brighter for a moment.
const DISPLAY = `${COMMON}
uniform sampler2D uTex;
uniform float uBeatAge;

void main() {
  vec3 c = texture2D(uTex, v).rgb;
  c = (c - 0.5) * 1.1 + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.05), 0.2);
  c += exp(-uBeatAge * 8.0) * 0.08;
  vec2 e = v - 0.5;
  c *= 1.0 - dot(e, e) * 0.5;
  c += (hash(v * uRes + fract(uTime) * 100.0) - 0.5) * 0.03;
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
let bins;
const level = { low: 0, mid: 0, high: 0, lowSlow: 0, kick: 0 };

/**
 * How loud one range is, from 0 to 1. Half the average, half the loudest point, so a
 * whistle or a single note counts even though it only fills a narrow slice of the range.
 */
function band(from, to) {
  let sum = 0;
  let peak = 0;
  for (let i = from; i < to; i += 1) {
    sum += bins[i];
    peak = Math.max(peak, bins[i]);
  }
  const value = (sum / (to - from) + peak) / 2 / 255;
  return Math.min(1, Math.max(0, (value - 0.1) / 0.7));
}

function ease(key, target) {
  level[key] += (target - level[key]) * (target > level[key] ? 0.45 : 0.06);
}

function readAudio() {
  if (!analyser) {
    ease('low', 0);
    ease('mid', 0);
    ease('high', 0);
    level.kick *= 0.9;
    return;
  }
  analyser.getByteFrequencyData(bins);
  // About 94 Hz per bin at 48 kHz.
  ease('low', band(1, 4));
  ease('mid', band(4, 32));
  ease('high', band(32, 110));
  level.lowSlow += (level.low - level.lowSlow) * 0.03;
  if (level.low - level.lowSlow > 0.08) {
    // A new beat only when the last one has faded, so one hit isn't counted twice.
    if (level.kick < 0.5) beatAt = performance.now();
    level.kick = 1;
  }
  level.kick *= 0.9;
}

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
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -30;
  bins = new Uint8Array(analyser.frequencyBinCount);
  audioSource = audioContext.createMediaStreamSource(stream);
  audioSource.connect(analyser);
}

function disconnectAudio() {
  audioSource?.disconnect();
  audioSource = null;
  analyser = null;
}

/* ---------- Loop ---------- */

let frame = 0;
const start = performance.now();
let last = start;
let spin = 0;
let beatAt = -Infinity;
// The canvas fades in only once it holds a camera frame, so it never fades in black.
let showing = false;

function draw() {
  frame = requestAnimationFrame(draw);
  readAudio();
  if (!gl || video.readyState < 2 || !video.videoWidth) return;
  resize();

  const now = performance.now();
  const time = (now - start) / 1000;
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  const motion = reducedMotion ? 0.35 : 1;
  spin += delta * (0.12 + level.mid * 1.8) * motion;
  const beatAge = Math.min(10, (now - beatAt) / 1000);
  const read = buffers[current];
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
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, read.tex);
  gl.uniform1i(f.uPrev, 1);
  gl.uniform2f(f.uRes, width, height);
  gl.uniform2f(f.uCamRes, video.videoWidth, video.videoHeight);
  gl.uniform1f(f.uTime, time);
  gl.uniform1f(f.uLow, level.low);
  gl.uniform1f(f.uMid, level.mid);
  gl.uniform1f(f.uHigh, level.high);
  gl.uniform1f(f.uBeatAge, beatAge);
  gl.uniform1f(f.uMotion, motion);
  gl.uniform1f(f.uSpin, spin);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const d = displayProgram.uniforms;
  gl.useProgram(displayProgram.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, write.tex);
  gl.uniform1i(d.uTex, 0);
  gl.uniform2f(d.uRes, width, height);
  gl.uniform1f(d.uTime, time);
  gl.uniform1f(d.uBeatAge, beatAge);
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

function close() {
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
  if (event.persisted) render();
});
