/* World: one three.js renderer that draws every 3D shot of the film.
 * Everything is a pure function of timeline time t (seconds): the stage
 * composition calls World.render(t) from its hf-seek listener.
 * Cue times come from window.VO (Kokoro word timings, assets/timing.js). */
(function () {
  const THREE = window.THREE;
  const VO = window.VO;
  const W = (window.World = {});
  W.WIDTH = 1920;
  W.HEIGHT = 1080;

  /* ---------- palette (shared with the overlays via CSS variables) ---------- */
  W.C = {
    ground: 0x05070b,
    ink: 0xe9eef2,
    copper: 0xe0894b,
    amber: 0xffb22e, // lithography
    teal: 0x2ec4b6, // deposition
    coral: 0xff5e5b, // remove (etch, CMP)
    violet: 0x9b7bff, // modify (implant)
    sky: 0x4cc9f0, // clean
    lime: 0xa7e163, // inspect
    uv: 0x8f6bff,
    silicon: 0x7d8a97,
    oxide: 0x9fd3e6,
    resist: 0xd4553f,
  };
  W.hex = (c) => "#" + c.toString(16).padStart(6, "0");

  /* ---------- math ---------- */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (t, a, b) => (b === a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));
  const smooth = (x) => x * x * (3 - 2 * x);
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2); // cubic in-out
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  const sramp = (t, a, b) => ease(ramp(t, a, b));
  const oramp = (t, a, b) => easeOut(ramp(t, a, b));
  // window: 0 before a, rises over fi, 1 until b, falls over fo
  const win = (t, a, b, fi = 0.35, fo = 0.35) => Math.min(ramp(t, a, a + fi), 1 - ramp(t, b - fo, b));
  W.m = { clamp, lerp, ramp, smooth, ease, easeOut, easeIn, sramp, oramp, win };

  W.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  W.hash = (i, s = 1) => {
    let x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /* ---------- cues from the voiceover ---------- */
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  W.ch = (id) => VO.chapters.find((c) => c.id === id);
  function findWord(chId, word, n) {
    let k = 0;
    const target = norm(word);
    for (const w of VO.words) {
      if (w.ch === chId && norm(w.text) === target && ++k === n) return w;
    }
    console.warn("[World] missing cue", chId, word, n);
    return null;
  }
  W.cue = (chId, word, n = 1) => {
    const w = findWord(chId, word, n);
    return w ? w.start : W.ch(chId).start;
  };
  W.cueEnd = (chId, word, n = 1) => {
    const w = findWord(chId, word, n);
    return w ? w.end : W.ch(chId).end;
  };
  // the slot a chapter owns on screen: from halfway through the gap before it to halfway through the gap after it
  W.slot = (chId) => {
    const i = VO.chapters.findIndex((c) => c.id === chId);
    const c = VO.chapters[i];
    const prev = VO.chapters[i - 1];
    const next = VO.chapters[i + 1];
    const start = prev ? (prev.end + c.start) / 2 : 0;
    const end = next ? (c.end + next.start) / 2 : VO.duration;
    return { start, end };
  };

  /* ---------- textures ---------- */
  W.canvasTex = function (w, h, draw, opts = {}) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d");
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    return tex;
  };

  let _glowTex;
  W.glowTex = () =>
    _glowTex ||
    (_glowTex = W.canvasTex(256, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.25, "rgba(255,255,255,0.45)");
      gr.addColorStop(0.6, "rgba(255,255,255,0.08)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }));
  W.glow = function (color, size, opacity = 1) {
    const m = new THREE.SpriteMaterial({
      map: W.glowTex(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  };

  // A processor die floorplan: P-cores, E-core clusters, cache, graphics, memory, I/O.
  let _dieTex;
  W.dieTex = () =>
    _dieTex ||
    (_dieTex = W.canvasTex(1024, 1024, (g, w, h) => {
      const r = W.rng(7);
      g.fillStyle = "#0d1216";
      g.fillRect(0, 0, w, h);
      const block = (x, y, bw, bh, base, lines = 60) => {
        g.fillStyle = base;
        g.fillRect(x, y, bw, bh);
        g.globalAlpha = 0.35;
        for (let i = 0; i < lines; i++) {
          const yy = y + r() * bh;
          const xx = x + r() * bw;
          g.fillStyle = r() < 0.5 ? "#ffffff" : "#000000";
          if (r() < 0.5) g.fillRect(x + 2, yy, bw - 4, 1 + r() * 2);
          else g.fillRect(xx, y + 2, 1 + r() * 2, bh - 4);
        }
        g.globalAlpha = 1;
        g.strokeStyle = "rgba(0,0,0,0.6)";
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      };
      // I/O ring
      block(0, 0, w, 40, "#2a2f36", 20);
      block(0, h - 40, w, 40, "#2a2f36", 20);
      // P-cores (two rows of four), cache spine in the middle
      const pc = ["#6b5a3e", "#735f40", "#6a5a42", "#71603f"];
      for (let i = 0; i < 4; i++) {
        block(30 + i * 165, 60, 155, 300, pc[i % 4], 90);
        block(30 + i * 165, 560, 155, 300, pc[(i + 1) % 4], 90);
      }
      block(30, 370, 650, 180, "#3b4d5c", 120); // L3 ring/cache
      // E-core clusters (four clusters of four)
      block(695, 60, 140, 300, "#4f614b", 70);
      block(695, 560, 140, 300, "#4b5f4f", 70);
      block(845, 60, 150, 300, "#55664c", 70);
      block(845, 560, 150, 300, "#4e6150", 70);
      block(695, 370, 300, 180, "#3a4b58", 80);
      // memory controller + graphics + media
      block(30, 870, 420, 110, "#4a3f5c", 60);
      block(460, 870, 535, 110, "#5a3f46", 60);
      // tiny E-core subdivisions
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 3;
      for (const [x, y] of [
        [695, 60],
        [845, 60],
        [695, 560],
        [845, 560],
      ]) {
        g.beginPath();
        g.moveTo(x + 70, y);
        g.lineTo(x + 70, y + 300);
        g.moveTo(x, y + 150);
        g.lineTo(x + 145, y + 150);
        g.stroke();
      }
    }));

  /* ---------- environment light ---------- */
  W.makeEnv = function (renderer) {
    const env = new THREE.Scene();
    const box = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.014, 0.02), side: THREE.BackSide })
    );
    env.add(box);
    const strip = (w, h, color, k, pos, look) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })
      );
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    strip(30, 6, 0xffe2c0, 5.0, [-18, 22, 12], [0, 0, 0]); // warm key
    strip(6, 30, 0x9ecbff, 3.6, [26, 6, -10], [0, 0, 0]); // cool rim
    strip(40, 3, 0xffffff, 2.4, [0, 30, -18], [0, 0, 0]); // overhead strip
    strip(24, 4, 0xffffff, 1.2, [0, 8, 30], [0, 0, 0]); // front fill
    strip(30, 2, 0xffffff, 0.8, [0, -20, 20], [0, 0, 0]); // floor bounce
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(env, 0.035);
    pm.dispose();
    return rt.texture;
  };

  /* ---------- shared materials ---------- */
  W.mat = {};
  function buildMaterials() {
    const M = W.mat;
    M.silicon = new THREE.MeshStandardMaterial({ color: 0x8b97a4, metalness: 0.75, roughness: 0.32 });
    M.siliconDark = new THREE.MeshStandardMaterial({ color: 0x4c5661, metalness: 0.6, roughness: 0.45 });
    M.copper = new THREE.MeshStandardMaterial({ color: 0xeaa06a, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.5 });
    M.oxide = new THREE.MeshPhysicalMaterial({
      color: 0x9fd3e6,
      metalness: 0,
      roughness: 0.15,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    M.resist = new THREE.MeshStandardMaterial({ color: 0xd4553f, roughness: 0.55, metalness: 0.0 });
    M.chip = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5, metalness: 0.3 });
    M.pcb = new THREE.MeshStandardMaterial({ color: 0x0f3b2e, roughness: 0.6, metalness: 0.2 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.38 });
    M.white = new THREE.MeshStandardMaterial({ color: 0xe8eaed, metalness: 0.1, roughness: 0.55 });
    M.dark = new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.3, roughness: 0.6 });
    M.gold = new THREE.MeshStandardMaterial({ color: 0xd8b45a, metalness: 1, roughness: 0.35 });
  }
  W.basic = (color, opacity = 1, additive = false) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1 || additive,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive && opacity >= 1,
    });

  /* ---------- scene helpers ---------- */
  W.newScene = function (opts = {}) {
    const s = new THREE.Scene();
    s.background = new THREE.Color(opts.bg != null ? opts.bg : W.C.ground);
    s.environment = W.env;
    if (opts.fog) s.fog = new THREE.Fog(opts.bg != null ? opts.bg : W.C.ground, opts.fog[0], opts.fog[1]);
    const key = new THREE.DirectionalLight(0xffe4c4, opts.key != null ? opts.key : 1.6);
    key.position.set(-6, 10, 7);
    const rim = new THREE.DirectionalLight(0x9cc8ff, opts.rim != null ? opts.rim : 1.1);
    rim.position.set(8, 3, -8);
    const amb = new THREE.AmbientLight(0xffffff, opts.amb != null ? opts.amb : 0.12);
    s.add(key, rim, amb);
    s.userData.lights = { key, rim, amb };
    return s;
  };
  W.newCamera = (fov = 35) => new THREE.PerspectiveCamera(fov, W.WIDTH / W.HEIGHT, 0.01, 2000);
  // camera rig: position and target as functions of t
  W.aim = function (cam, pos, target, roll = 0) {
    cam.position.set(pos[0], pos[1], pos[2]);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(target[0], target[1], target[2]);
  };
  // interpolate keyframed vectors: keys = [[t, [x,y,z]], ...] with cubic in-out between keys
  W.path = function (keys, t, e = ease) {
    if (t <= keys[0][0]) return keys[0][1].slice();
    for (let i = 0; i < keys.length - 1; i++) {
      const [ta, a] = keys[i];
      const [tb, b] = keys[i + 1];
      if (t <= tb) {
        const k = e(ramp(t, ta, tb));
        return a.map((v, j) => lerp(v, b[j], k));
      }
    }
    return keys[keys.length - 1][1].slice();
  };
  W.scalar = function (keys, t, e = ease) {
    return W.path(
      keys.map(([tt, v]) => [tt, [v]]),
      t,
      e
    )[0];
  };

  // rounded rectangle extrusion (phones, packages, pods)
  W.roundedBox = function (w, h, d, r, bevel = 0.02) {
    const s = new THREE.Shape();
    const x = -w / 2,
      y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: d - bevel * 2,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 10,
    });
    g.translate(0, 0, -(d - bevel * 2) / 2);
    return g;
  };

  /* ---------- labels anchored to 3D points ---------- */
  const labels = [];
  let labelLayer, leaderSvg;
  // spec: { shot, text, sub, color, at: Vector3 | (t)=>Vector3, from, to, dx, dy, size }
  W.label = function (spec) {
    labels.push(spec);
    return spec;
  };
  function buildLabels() {
    for (const L of labels) {
      const el = document.createElement("div");
      el.className = "w-label";
      el.innerHTML =
        (L.text ? `<div class="w-label-k">${L.text}</div>` : "") + (L.sub ? `<div class="w-label-v">${L.sub}</div>` : "");
      const col = W.hex(L.color != null ? L.color : W.C.ink);
      el.style.setProperty("--lc", col);
      if (L.big) el.classList.add("big");
      if (L.align === "left") el.classList.add("left");
      labelLayer.appendChild(el);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", col);
      line.setAttribute("stroke-width", "1.6");
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "4.5");
      dot.setAttribute("fill", col);
      leaderSvg.appendChild(line);
      leaderSvg.appendChild(dot);
      L.el = el;
      L.line = line;
      L.dot = dot;
    }
  }
  const _v = new THREE.Vector3();
  function project(p, cam) {
    _v.copy(p).project(cam);
    return [(_v.x * 0.5 + 0.5) * W.WIDTH, (-_v.y * 0.5 + 0.5) * W.HEIGHT, _v.z];
  }
  W.project = project;
  function updateLabels(t, shot) {
    for (const L of labels) {
      const on = shot && L.shot === shot.id ? win(t, L.from, L.to, 0.3, 0.3) : 0;
      if (on <= 0.001) {
        L.el.style.opacity = 0;
        L.line.style.opacity = 0;
        L.dot.style.opacity = 0;
        continue;
      }
      const p = typeof L.at === "function" ? L.at(t) : L.at;
      const [x, y, z] = project(p, shot.camera);
      if (z > 1) {
        L.el.style.opacity = 0;
        L.line.style.opacity = 0;
        L.dot.style.opacity = 0;
        continue;
      }
      const dx = L.dx != null ? L.dx : 90;
      const dy = L.dy != null ? L.dy : -70;
      const k = easeOut(ramp(t, L.from, L.from + 0.45));
      let lx = x + dx * k;
      let ly = y + dy * k;
      if (!L.w) L.w = L.el.offsetWidth || 300;
      if (!L.h) L.h = L.el.offsetHeight || 80;
      if (dx >= 0 && lx + L.w > W.WIDTH - 70) lx = W.WIDTH - 70 - L.w;
      if (dx < 0 && lx - L.w < 70) lx = 70 + L.w;
      ly = clamp(ly, 60 + L.h / 2, W.HEIGHT - 190 - L.h / 2);
      L.el.style.opacity = on;
      L.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(${dx < 0 ? "-100%" : "0"}, -50%)`;
      L.line.style.opacity = on;
      L.dot.style.opacity = on;
      L.line.setAttribute("x1", x.toFixed(1));
      L.line.setAttribute("y1", y.toFixed(1));
      L.line.setAttribute("x2", (lx - Math.sign(dx || 1) * 8).toFixed(1));
      L.line.setAttribute("y2", ly.toFixed(1));
      L.dot.setAttribute("cx", x.toFixed(1));
      L.dot.setAttribute("cy", y.toFixed(1));
    }
  }

  /* ---------- shots ---------- */
  W.shots = [];
  W.defs = [];
  // def: { id, from:()=>t, to:()=>t, fadeIn, fadeOut, setup(shot) }  setup sets shot.scene, shot.camera, shot.update(t)
  W.shot = (def) => W.defs.push(def);

  let renderer, fadeEl;
  W.mount = function (canvas, layer, svg, fade) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(W.WIDTH, W.HEIGHT, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    W.renderer = renderer;
    W.env = W.makeEnv(renderer);
    buildMaterials();
    labelLayer = layer;
    leaderSvg = svg;
    fadeEl = fade;
    for (const d of W.defs) {
      const shot = { id: d.id, from: d.from(), to: d.to(), fadeIn: d.fadeIn != null ? d.fadeIn : 0.35, fadeOut: d.fadeOut != null ? d.fadeOut : 0.35 };
      d.setup(shot);
      W.shots.push(shot);
    }
    W.shots.sort((a, b) => a.from - b.from);
    buildLabels();
    // compile every scene once so no frame pays for shader compiles
    for (const s of W.shots) renderer.compile(s.scene, s.camera);
  };

  W.active = function (t) {
    for (const s of W.shots) if (t >= s.from && t < s.to) return s;
    return null;
  };

  W.render = function (t) {
    const shot = W.active(t);
    if (!shot) {
      renderer.setClearColor(W.C.ground, 1);
      renderer.clear();
      updateLabels(t, null);
      fadeEl.style.opacity = 1;
      return;
    }
    shot.update(t);
    renderer.render(shot.scene, shot.camera);
    updateLabels(t, shot);
    const vis = Math.min(
      shot.fadeIn > 0 ? ramp(t, shot.from, shot.from + shot.fadeIn) : 1,
      shot.fadeOut > 0 ? 1 - ramp(t, shot.to - shot.fadeOut, shot.to) : 1
    );
    fadeEl.style.opacity = (1 - vis).toFixed(3);
  };
})();
