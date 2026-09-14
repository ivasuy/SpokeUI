const VERTEX = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const SHARED_NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    amplitude *= 0.5;
  }
  return value;
}`;

const TOPO_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dpr;
${SHARED_NOISE}

void main() {
  vec2 screenUv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  p.x += u_time * 0.018;
  p.y -= u_time * 0.012;

  float field = fbm(p * 1.72 + vec2(3.7, 8.2));
  field += 0.18 * fbm(p * 3.25 - vec2(u_time * 0.015, 2.0));
  float band = abs(fract(field * 18.0) - 0.5) * 2.0;
  float contour = 1.0 - smoothstep(0.0, 0.014, band);

  float gridSize = 64.0 * u_dpr;
  vec2 gridUv = fract(gl_FragCoord.xy / gridSize);
  float grid = max(
    1.0 - smoothstep(0.0, 1.2 / gridSize, min(gridUv.x, 1.0 - gridUv.x)),
    1.0 - smoothstep(0.0, 1.2 / gridSize, min(gridUv.y, 1.0 - gridUv.y))
  );

  vec3 ink = vec3(0.047, 0.057, 0.078);
  vec3 cobalt = vec3(0.078, 0.333, 1.0);
  vec3 steel = vec3(0.42, 0.54, 0.76);
  float focus = smoothstep(0.05, 0.92, screenUv.x) * (0.35 + 0.65 * smoothstep(0.0, 0.65, 1.0 - abs(screenUv.y - 0.48)));
  vec3 color = ink;
  color += steel * grid * 0.045;
  color += mix(steel, cobalt, focus) * contour * (0.035 + focus * 0.2);
  float vignette = smoothstep(0.95, 0.28, length(screenUv - 0.5));
  color *= mix(0.54, 1.0, vignette);
  gl_FragColor = vec4(color, 1.0);
}`;

const WAVES_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dpr;
${SHARED_NOISE}

vec3 palette(float value) {
  vec3 ink = vec3(0.047, 0.057, 0.078);
  vec3 navy = vec3(0.07, 0.11, 0.22);
  vec3 cobalt = vec3(0.078, 0.333, 1.0);
  vec3 paper = vec3(0.89, 0.91, 0.95);
  vec3 color = mix(ink, navy, smoothstep(0.05, 0.52, value));
  color = mix(color, cobalt, smoothstep(0.48, 0.78, value) * 0.58);
  return mix(color, paper, smoothstep(0.82, 1.0, value) * 0.16);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float angle = 5.655;
  p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
  p *= 2.0;
  p += vec2(0.11, -0.19) + 0.11 * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  p += 0.045 * (vec2(fbm(p * 1.54 + 4012.0), fbm(p * 1.54 + vec2(5.2, 1.3))) - 0.5);

  float value = uv.y;
  value += sin(uv.x * 7.8 - u_time * 0.72) * 0.075;
  value += (fbm(p * 2.0 - u_time * 0.07) - 0.5) * 0.32;
  vec3 color = palette(value);
  color = (color - 0.5) * 1.16 + 0.5;
  float vignette = smoothstep(0.96, 0.25, length(uv - 0.5));
  color *= mix(0.5, 1.0, vignette);
  float grain = hash21(gl_FragCoord.xy + 17.0) - 0.5;
  color += grain * 0.025;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function createProgram(gl, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'Shader compilation failed.');
    }
    return shader;
  };

  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message || 'Shader linking failed.');
  }
  return program;
}

function mountShader(canvas, fragmentSource, { reduceMotion }) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return;

  const program = createProgram(gl, fragmentSource);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const resolution = gl.getUniformLocation(program, 'u_resolution');
  const time = gl.getUniformLocation(program, 'u_time');
  const dprUniform = gl.getUniformLocation(program, 'u_dpr');
  let frame = 0;
  let visible = true;
  const started = performance.now();

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rawWidth = Math.max(1, Math.round(bounds.width * dpr));
    const rawHeight = Math.max(1, Math.round(bounds.height * dpr));
    const pixelScale = Math.min(1, Math.sqrt(2_000_000 / Math.max(1, rawWidth * rawHeight)));
    const width = Math.max(1, Math.round(rawWidth * pixelScale));
    const height = Math.max(1, Math.round(rawHeight * pixelScale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(resolution, width, height);
    gl.uniform1f(dprUniform, dpr * pixelScale);
  };

  const render = (now) => {
    frame = 0;
    if (!visible) return;
    resize();
    gl.uniform1f(time, reduceMotion ? 0 : (now - started) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduceMotion) frame = requestAnimationFrame(render);
  };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (reduceMotion) render(started);
  });
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && frame === 0) frame = requestAnimationFrame(render);
    if (!visible && frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  intersectionObserver.observe(canvas);
  frame = requestAnimationFrame(render);
}

export function initShaders({ reduceMotion = false } = {}) {
  document.querySelectorAll('canvas[data-shader]').forEach((canvas) => {
    const fragment = canvas.dataset.shader === 'topo' ? TOPO_FRAGMENT : WAVES_FRAGMENT;
    mountShader(canvas, fragment, { reduceMotion });
  });
}
