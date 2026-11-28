// Fluted glass: the one picture effect on the site, shared by the mirror page (the camera)
// and the project player's »« button (the video). Change it here and both change.
//
// The picture is cut into three upright bands with gently bowed seams. Each band looks at
// its own side of the picture (left, middle, right) through a window a little wider than
// its third, so what is in the middle repeats across the bands, shifted, the way it does
// behind reeded glass. The seams are soft: neighbouring bands cross-fade into each other
// instead of meeting at a line. Then a touch more contrast and a soft dark edge.
//
// Sound bends it a little (level, 0 to 1): the seams ripple and each band's lens swells.
// In silence (level 0) it is the still glass. The project player passes the video's sound,
// the mirror the microphone.
//
// Two ways to draw it:
// - createFlutedGlass: WebGL, the real thing. It has to read the picture's pixels, so it
//   works for the camera and for a video file its host shares (CORS).
// - createFlutedGlassFilter: for a picture the page may not read (a Vimeo player, which is
//   another site's frame, or a file its host won't share). An SVG filter shows the same
//   three bands, each looking at its own side, without reading anything. Browsers only let
//   a filter move pixels about there, not stretch or bend them, so the seams are straight
//   and hard, and each band shows its window at full size instead of squeezed.

/** Bands across the picture. */
export const BANDS = 3;
/** How much of the picture's width each band shows. More than a third, so they overlap. */
export const SPAN = 0.5;
/** How far each band's view sits from the middle, per band: left, middle, right. */
export const SPREAD = 0.24;
/** How much the seams bow, outwards in the middle and inwards at the top and bottom. */
export const BOW = 0.18;
/** How wide each seam's cross-fade is, as a share of a band, on each side of the seam. */
export const SOFT = 0.15;
/** With sound: how far the seams ripple sideways at full level, as a share of a band. */
export const RIPPLE = 0.14;
/** With sound: ripples down the height of the picture, and how fast they travel. */
export const RIPPLE_WAVES = 1.6;
export const RIPPLE_SPEED = 2.4;
/** With sound: how much more each band's lens swells at full level (still: 0.15). */
export const SWELL = 0.35;
/** With sound, in the SVG version: how much further each band looks out at full level. */
export const REACH = 1.2;

const float = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));

const VERTEX = `
attribute vec2 p;
varying vec2 v;
void main() {
  v = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform vec2 uRes;`;

const GLASS = `${HEAD}
uniform sampler2D uCam;
uniform vec2 uCamRes;
// 1.0 shows the picture mirrored, as a mirror does (the camera); 0.0 as it is (a film).
uniform float uMirror;
// The sound, 0 to 1, and the time in seconds, for the ripple.
uniform float uLevel;
uniform float uTime;

const float BANDS = ${float(BANDS)};
const float SPAN = ${float(SPAN)};
const float SPREAD = ${float(SPREAD)};
const float BOW = ${float(BOW)};
const float SOFT = ${float(SOFT)};
const float RIPPLE = ${float(RIPPLE)};
const float RIPPLE_WAVES = ${float(RIPPLE_WAVES)};
const float RIPPLE_SPEED = ${float(RIPPLE_SPEED)};
const float SWELL = ${float(SWELL)};

vec3 cam(vec2 uv) {
  float s = (uRes.x / uRes.y) / (uCamRes.x / uCamRes.y);
  if (s > 1.0) uv.y = (uv.y - 0.5) / s + 0.5;
  else uv.x = (uv.x - 0.5) * s + 0.5;
  uv.x = mix(uv.x, 1.0 - uv.x, uMirror);
  // Mirror at the edges instead of smearing the last pixel.
  uv = abs(mod(uv + 1.0, 2.0) - 1.0);
  return texture2D(uCam, uv).rgb;
}

// One band's picture. across runs 0 to 1 over the band (a little past it at a seam).
vec3 band(float k, float across, float y) {
  float lens = across - 0.5;
  // A gentle lens swells the middle of each band, as a glass rib does.
  lens *= 1.0 - (0.15 + SWELL * uLevel) * (1.0 - 4.0 * clamp(lens * lens, 0.0, 0.25));
  float centre = 0.5 + (k - (BANDS - 1.0) * 0.5) * SPREAD;
  return cam(vec2(centre + lens * SPAN, 0.5 + y * 0.96));
}

void main() {
  float y = v.y - 0.5;
  // The seams bow away from the centre line, mirrored on both sides. 4y² - 1/3 averages
  // zero over the height, so each band is a third of the width on average.
  float d = (v.x - 0.5) * BANDS;
  float x = d * (1.0 + BOW * (4.0 * y * y - 1.0 / 3.0)) + BANDS * 0.5;
  // With sound, the seams ripple: a wave travels down the picture, as deep as it is loud.
  x += uLevel * RIPPLE * sin(y * 6.2832 * RIPPLE_WAVES + uTime * RIPPLE_SPEED);
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
const FINISH = `${HEAD}
uniform sampler2D uTex;

void main() {
  vec3 c = texture2D(uTex, v).rgb;
  c = (c - 0.5) * 1.06 + 0.5;
  vec2 e = v - 0.5;
  c *= 1.0 - dot(e, e) * 0.35;
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * Draws pictures through the glass into `canvas`, at the canvas's own size. Null without
 * WebGL. `draw(source)` takes a playing <video> and returns false when its pixels may not
 * be read (a file its host doesn't share).
 */
export function createFlutedGlass(canvas, { mirrored = false } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = (fragment) => {
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
  };
  const texture = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };

  let glass;
  let finish;
  try {
    glass = program(GLASS);
    finish = program(FINISH);
  } catch (error) {
    console.error(error);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const picture = texture();

  let width = 0;
  let height = 0;
  let pass = null;

  // Full CSS pixels, so the picture stays sharp. Not more, to keep phones cool.
  const resize = () => {
    const w = Math.max(2, Math.round(canvas.clientWidth || innerWidth));
    const h = Math.max(2, Math.round(canvas.clientHeight || innerHeight));
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    if (pass) {
      gl.deleteTexture(pass.tex);
      gl.deleteFramebuffer(pass.fbo);
    }
    const tex = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    pass = { tex, fbo };
  };

  return {
    /** One frame, bent by `level` (0 to 1) at `time` (seconds). False when the picture can't be read. */
    draw(source, { level = 0, time = 0 } = {}) {
      if (!source.videoWidth || source.readyState < 2) return true;
      resize();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, picture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      } catch {
        // The host doesn't share the video: WebGL may not read it.
        return false;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo);
      gl.viewport(0, 0, width, height);
      gl.useProgram(glass.prog);
      gl.uniform1i(glass.uniforms.uCam, 0);
      gl.uniform2f(glass.uniforms.uRes, width, height);
      gl.uniform2f(glass.uniforms.uCamRes, source.videoWidth, source.videoHeight);
      gl.uniform1f(glass.uniforms.uMirror, mirrored ? 1 : 0);
      gl.uniform1f(glass.uniforms.uLevel, level);
      gl.uniform1f(glass.uniforms.uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(finish.prog);
      gl.bindTexture(gl.TEXTURE_2D, pass.tex);
      gl.uniform1i(finish.uniforms.uTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

const SVG = 'http://www.w3.org/2000/svg';
let filters = 0;

/**
 * Each band's sideways move for the filter, as a share of the width: its window's centre
 * (as in the shader) minus its own centre on screen, so it shows its own side.
 */
export function bandShifts(bands = BANDS, spread = SPREAD) {
  return Array.from({ length: bands }, (_, k) => (k + 0.5) / bands - (0.5 + (k - (bands - 1) / 2) * spread));
}

/**
 * The glass as an SVG filter on `element`'s wrapper, for a picture the page may not read.
 * It goes on the wrapper, not the element: WebKit (Safari, and every iPhone browser) draws
 * nothing at all for an iframe with an SVG filter of its own, but filters its wrapper fine.
 * Sizes are fractions of the wrapper (objectBoundingBox): WebKit also dropped the filter when
 * they were in pixels.
 */
export function createFlutedGlassFilter(element, { getLevel = null } = {}) {
  const target = element.parentElement ?? element;
  const id = `fluted-glass-${(filters += 1)}`;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  // Behaviour: the filter's own element takes no room.
  svg.style.position = 'absolute';
  const set = (node, attributes) => Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  const filter = document.createElementNS(SVG, 'filter');
  filter.id = id;
  set(filter, {
    filterUnits: 'objectBoundingBox',
    primitiveUnits: 'objectBoundingBox',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    'color-interpolation-filters': 'sRGB',
  });
  const merge = document.createElementNS(SVG, 'feMerge');
  const offsets = [];
  const shifts = bandShifts();
  shifts.forEach((dx, k) => {
    const offset = document.createElementNS(SVG, 'feOffset');
    set(offset, { in: 'SourceGraphic', x: (k / BANDS).toFixed(5), width: (1 / BANDS).toFixed(5), y: 0, height: 1, dx: dx.toFixed(5), result: `band${k}` });
    const node = document.createElementNS(SVG, 'feMergeNode');
    node.setAttribute('in', `band${k}`);
    filter.append(offset);
    merge.append(node);
    offsets.push(offset);
  });
  filter.append(merge);
  svg.append(filter);
  document.body.append(svg);

  // With sound, the outer bands look further out as it gets louder. Only a visible change
  // is written: every write makes the browser filter the frame again.
  let raf = 0;
  let on = false;
  let last = -1;
  const follow = () => {
    raf = on && getLevel && !document.hidden ? requestAnimationFrame(follow) : 0;
    const level = getLevel ? getLevel() : 0;
    if (Math.abs(level - last) < 0.01) return;
    last = level;
    offsets.forEach((offset, k) => offset.setAttribute('dx', (shifts[k] * (1 + REACH * level)).toFixed(5)));
  };
  const onVisible = () => {
    if (on && !raf && !document.hidden) follow();
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    // Behaviour: the filter is the effect, so it is set and cleared here.
    start() {
      target.style.filter = `url(#${id})`;
      on = true;
      if (!raf) follow();
    },
    stop() {
      on = false;
      cancelAnimationFrame(raf);
      raf = 0;
      target.style.filter = '';
    },
    destroy() {
      this.stop();
      document.removeEventListener('visibilitychange', onVisible);
      svg.remove();
    },
  };
}
