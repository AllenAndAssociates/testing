/* Chapters 1–3: the hook (phone, hair, printed wafer), inside the die, eighty layers. */
(function () {
  const THREE = window.THREE;
  const W = window.World;
  const { clamp, lerp, ramp, sramp, oramp, win, ease, easeOut } = W.m;
  const C = W.C;
  const cue = W.cue,
    cueEnd = W.cueEnd,
    slot = W.slot;
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _p = new THREE.Vector3(),
    _s = new THREE.Vector3(),
    _c = new THREE.Color();

  /* ======================= shared: the wafer ======================= */
  // r = 3 units ↔ 150 mm. Dies are 23.8 × 10.8 mm like the desktop CPU in the script.
  W.makeWafer = function (opts = {}) {
    const R = 3;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.05, 160), W.mat.silicon);
    g.add(disc);
    const u = R / 150;
    const dw = 23.8 * u,
      dh = 10.8 * u,
      gap = 0.25 * u;
    const dies = [];
    const nx = Math.ceil(R / (dw + gap)) + 1,
      nz = Math.ceil(R / (dh + gap)) + 1;
    for (let j = -nz; j <= nz; j++) {
      for (let i = -nx; i <= nx; i++) {
        const x = (i + 0.5) * (dw + gap),
          z = (j + 0.5) * (dh + gap);
        let inside = true;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          if (Math.hypot(x + (sx * dw) / 2, z + (sz * dh) / 2) > R - 3 * u) inside = false;
        }
        if (inside) dies.push({ x, z, i, j });
      }
    }
    // serpentine stepping order (row by row, alternating direction) — the scanner's path
    dies.sort((a, b) => (a.j - b.j) || (a.j % 2 === 0 ? a.i - b.i : b.i - a.i));
    dies.forEach((d, k) => (d.order = k));
    const dieMat = new THREE.MeshStandardMaterial({
      map: W.dieTex(),
      metalness: 0.55,
      roughness: 0.3,
      color: 0xffffff,
    });
    const geo = new THREE.PlaneGeometry(dw, dh);
    geo.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, dieMat, dies.length);
    dies.forEach((d, k) => {
      _m.makeTranslation(d.x, 0.027, d.z);
      inst.setMatrixAt(k, _m);
      inst.setColorAt(k, _c.setRGB(1, 1, 1));
    });
    g.add(inst);
    const w = { group: g, disc, inst, dies, R, dw, dh };
    // tint: 0 = bare (dark), 1 = patterned, iridescent; hue drifts with `phase`
    w.paint = function (fn, phase = 0) {
      for (const d of dies) {
        const k = fn(d);
        const ang = Math.atan2(d.z, d.x);
        const h = (0.56 + 0.18 * Math.sin(ang * 2 + phase) + 0.08 * Math.hypot(d.x, d.z)) % 1;
        _c.setHSL(h, 0.55, 0.62);
        const dark = 0.07;
        inst.setColorAt(d.order, _c.setRGB(lerp(dark, _c.r * 1.25, k), lerp(dark, _c.g * 1.25, k), lerp(dark, _c.b * 1.25, k)));
      }
      inst.instanceColor.needsUpdate = true;
    };
    w.paint(() => (opts.bare ? 0 : 1));
    return w;
  };

  /* ======================= shared: the phone, X-ray view ======================= */
  W.makePhone = function () {
    const phone = new THREE.Group();
    const shellGeo = W.roundedBox(7.2, 15, 0.8, 1.05, 0.06);
    const shell = new THREE.Mesh(
      shellGeo,
      new THREE.MeshPhysicalMaterial({ color: 0x0a0f16, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false })
    );
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo, 30), new THREE.LineBasicMaterial({ color: 0x6fb7d9, transparent: true, opacity: 0.55 }));
    phone.add(shell, edges);
    // battery and board
    const battery = new THREE.Mesh(new THREE.BoxGeometry(6.0, 7.2, 0.42), new THREE.MeshStandardMaterial({ color: 0x1b2027, roughness: 0.5, metalness: 0.4 }));
    battery.position.set(0, -3.4, -0.05);
    const board = new THREE.Mesh(new THREE.BoxGeometry(6.3, 6.3, 0.08), W.mat.pcb);
    board.position.set(0, 3.75, 0);
    phone.add(battery, board);
    // camera bump rings
    for (const [x, y] of [
      [-2.1, 5.9],
      [-2.1, 4.4],
      [-0.8, 5.15],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 10, 48), W.mat.steel);
      ring.position.set(x, y, 0.42);
      phone.add(ring);
    }
    // 62 chips packed on the board, the big SoC first
    const r = W.rng(62);
    const chips = [];
    const tryPlace = (w, h) => {
      for (let k = 0; k < 400; k++) {
        const x = -2.95 + w / 2 + r() * (5.9 - w);
        const y = 0.75 + h / 2 + r() * (5.9 - h);
        if (x < -0.1 && y > 3.8 && x - w / 2 < -0.2) continue; // keep clear of the camera module
        if (chips.every((c) => Math.abs(c.x - x) > (c.w + w) / 2 + 0.06 || Math.abs(c.y - y) > (c.h + h) / 2 + 0.06)) {
          chips.push({ x, y, w, h });
          return true;
        }
      }
      return false;
    };
    chips.push({ x: 0.9, y: 3.4, w: 1.55, h: 1.55 }); // application processor
    chips.push({ x: 2.2, y: 5.6, w: 1.1, h: 0.9 }); // modem
    chips.push({ x: -1.6, y: 1.8, w: 1.2, h: 1.0 }); // storage
    const sizes = [];
    while (chips.length + sizes.length < 62) sizes.push(0.18 + Math.pow(r(), 2.2) * 0.85);
    sizes.sort((a, b) => b - a);
    for (const sz of sizes) {
      const asp = 0.6 + r() * 0.8;
      if (!tryPlace(sz, sz * asp)) tryPlace(sz * 0.6, sz * 0.6 * asp);
    }
    while (chips.length > 62) chips.pop();
    const chipGeo = new THREE.BoxGeometry(1, 1, 1);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.3, emissive: 0x000000 });
    const chipInst = new THREE.InstancedMesh(chipGeo, chipMat, chips.length);
    const soc = chips[0];
    chips.forEach((c, k) => {
      c.d = Math.hypot(c.x - soc.x, c.y - soc.y);
      c.th = 0.1 + Math.min(c.w, c.h) * 0.12;
      _m.compose(_p.set(c.x, c.y, 0.04 + c.th / 2), _q.identity(), _s.set(c.w, c.h, c.th));
      chipInst.setMatrixAt(k, _m);
      chipInst.setColorAt(k, _c.setRGB(0.1, 0.11, 0.12));
    });
    const order = chips.map((c, k) => k).sort((a, b) => chips[a].d - chips[b].d);
    order.forEach((k, n) => (chips[k].n = n));
    phone.add(chipInst);
    // glow per chip
    const glows = chips.map((c) => {
      const gl = W.glow(C.amber, Math.max(c.w, c.h) * 2.6, 0);
      gl.position.set(c.x, c.y, 0.5);
      phone.add(gl);
      return gl;
    });
    // shimmer: transistor sparkles over the chips
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const c = chips[Math.floor(r() * chips.length)];
      pos[i * 3] = c.x + (r() - 0.5) * c.w * 0.9;
      pos[i * 3 + 1] = c.y + (r() - 0.5) * c.h * 0.9;
      pos[i * 3 + 2] = 0.08 + c.th + 0.01;
      seeds[i] = r();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pcol = new Float32Array(N * 3);
    pg.setAttribute("color", new THREE.BufferAttribute(pcol, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    phone.add(pts);

    // light the chips up in order of distance from the processor; sparkle the transistors after tBn
    const light = (t, t62, tSpan, tBn) => {
      chips.forEach((c, k) => {
        const tk = t62 + (c.n / 62) * tSpan;
        const on = oramp(t, tk, tk + 0.35);
        const flash = Math.exp(-Math.max(0, t - tk) * 3.2) * (t >= tk ? 1 : 0);
        const g = 0.1 + on * 0.75;
        chipInst.setColorAt(k, _c.setRGB(g * 1.0, g * 0.72, g * 0.4));
        glows[k].material.opacity = on * 0.22 + flash * 0.7;
      });
      chipInst.instanceColor.needsUpdate = true;
      const sp = oramp(t, tBn, tBn + 1.2);
      for (let i = 0; i < N; i++) {
        const tw = 0.5 + 0.5 * Math.sin(t * (3 + seeds[i] * 5) + seeds[i] * 40);
        const v = sp * (0.25 + 0.75 * tw * tw);
        pcol[i * 3] = v;
        pcol[i * 3 + 1] = v * 0.85;
        pcol[i * 3 + 2] = v * 0.6;
      }
      pg.attributes.color.needsUpdate = true;
    };
    const anchor = (x, y, z) => () => {
      const v = new THREE.Vector3(x, y, z);
      phone.updateMatrixWorld();
      return v.applyMatrix4(phone.matrixWorld);
    };
    return { group: phone, chips, soc, light, anchor };
  };

  /* ======================= 1. hook: phone X-ray ======================= */
  W.shot({
    id: "hook-phone",
    from: () => 0,
    to: () => cue("hook", "each") - 0.15,
    fadeIn: 0.6,
    setup(shot) {
      const s = W.newScene({ key: 1.2, rim: 1.4 });
      const cam = W.newCamera(32);
      const P = W.makePhone();
      const phone = P.group;
      s.add(phone);
      const halo = W.glow(0x3a7bd5, 40, 0.18);
      halo.position.set(0, 0, -6);
      s.add(halo);
      const t62 = cue("hook", "sixty-two") - 0.1;
      const tSpan = cueEnd("hook", "microchips") - t62 + 0.4;
      const tBn = cue("hook", "ninety");
      const tEnd = shot.to;
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        phone.rotation.set(lerp(-0.38, -0.22, sramp(t, 0, tEnd)), lerp(-0.62, -0.18, sramp(t, 0, tEnd)), lerp(0.08, 0.02, sramp(t, 0, tEnd)));
        const z = lerp(27, 19, sramp(t, 0, tEnd));
        W.aim(cam, [lerp(-3.5, -0.6, sramp(t, 0, tEnd)), lerp(3.2, 3.6, sramp(t, 0, tEnd)), z], [-0.8, 2.4, 0]);
        P.light(t, t62, tSpan, tBn);
      };
      W.label({ shot: "hook-phone", text: "Application processor", sub: "the biggest of 62", color: C.amber, at: P.anchor(P.soc.x, P.soc.y, 0.4), from: t62 + 0.9, to: tEnd, dx: 260, dy: -150 });
    },
  });

  /* ======================= 1b. hook: hair vs transistors ======================= */
  W.shot({
    id: "hook-hair",
    from: () => cue("hook", "each") - 0.15,
    to: () => cue("hook", "none") - 0.12,
    fadeIn: 0.25,
    fadeOut: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 2.0, rim: 2.2, amb: 0.06 });
      const cam = W.newCamera(30);
      const R = 3; // hair radius ↔ 37.5 µm (75 µm hair)
      const cuticle = W.canvasTex(
        512,
        256,
        (g, w, h) => {
          g.fillStyle = "#6b4a2e";
          g.fillRect(0, 0, w, h);
          const r = W.rng(3);
          for (let row = 0; row < 9; row++) {
            for (let x = -40; x < w + 40; x += 70) {
              const y = (row / 8) * h + (r() - 0.5) * 8;
              g.strokeStyle = "rgba(30,18,8,0.55)";
              g.lineWidth = 3;
              g.beginPath();
              g.moveTo(x + r() * 20, y - 30);
              g.quadraticCurveTo(x + 45 + r() * 10, y, x + r() * 20, y + 30);
              g.stroke();
            }
          }
        },
        { repeat: [6, 1] }
      );
      const hair = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, 80, 96, 1, true),
        new THREE.MeshStandardMaterial({ map: cuticle, roughness: 0.42, metalness: 0.05, color: 0xb08a68 })
      );
      hair.rotation.z = Math.PI / 2;
      hair.rotation.x = 0.0;
      s.add(hair);
      // a strip of transistors laid across the hair's width, 57 nm apart: 75 000 / 57 ≈ 1 316
      const n = 1316;
      const pitch = (2 * R) / n;
      const fin = new THREE.InstancedMesh(new THREE.BoxGeometry(pitch * 0.42, pitch * 0.42, pitch * 6), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2a6f9a, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 }), n);
      for (let i = 0; i < n; i++) {
        _m.makeTranslation(0, -R + (i + 0.5) * pitch, R + pitch * 4);
        fin.setMatrixAt(i, _m);
      }
      s.add(fin);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(pitch * 3, 2 * R, pitch * 2), new THREE.MeshStandardMaterial({ color: 0x33414f, metalness: 0.6, roughness: 0.4 }));
      rail.position.set(0, 0, R + pitch * 1.5);
      s.add(rail);
      const tZoom = cue("hook", "thousand") - 0.3;
      const tZoomEnd = cue("hook", "across") + 0.2;
      shot.scene = s;
      shot.camera = cam;
      // zoom target: near the top of the strip so the hair's edge stays in frame
      const tgt = [0, R - pitch * 18, R + pitch * 3];
      shot.update = (t) => {
        const k = sramp(t, tZoom, tZoomEnd);
        const dist = Math.exp(lerp(Math.log(22), Math.log(0.11), k));
        const drift = (t - shot.from) * 0.05;
        const ty = lerp(0, tgt[1], k);
        W.aim(cam, [lerp(6 + drift, 0.022, k), lerp(1.2, ty + 0.012, k), tgt[2] + dist], [lerp(drift * 0.4, 0, k), ty, lerp(0, tgt[2], k)]);
        cam.near = Math.max(0.0005, dist * 0.01);
        cam.updateProjectionMatrix();
      };
      W.label({ shot: "hook-hair", text: "Human hair", sub: "≈ 75,000 nm wide", color: 0xd9a46b, at: new THREE.Vector3(-3.5, R * 0.9, R * 0.2), from: shot.from + 0.5, to: tZoom + 0.6, dx: -80, dy: -170 });
      W.label({ shot: "hook-hair", text: "One transistor every", sub: "57 nm", color: C.sky, at: new THREE.Vector3(0, tgt[1] - pitch * 4, R + pitch * 4), from: tZoomEnd - 0.3, to: shot.to, dx: 220, dy: 120 });
    },
  });

  /* ======================= 1c. hook: printed with light ======================= */
  W.shot({
    id: "hook-print",
    from: () => cue("hook", "none") - 0.12,
    to: () => slot("hook").end,
    fadeIn: 0.25,
    fadeOut: 0.3,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.5 });
      const cam = W.newCamera(30);
      const wafer = W.makeWafer({ bare: true });
      s.add(wafer.group);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 8, 32, 1, true), W.basic(C.uv, 0.5, true));
      beam.geometry.translate(0, 4, 0);
      s.add(beam);
      const spot = W.glow(C.uv, 1.6, 0.9);
      s.add(spot);
      const halo = W.glow(0x5b46c8, 14, 0.0);
      halo.position.set(0, -0.5, 0);
      s.add(halo);
      const t0 = cue("hook", "printed") - 0.2;
      const t1 = cueEnd("hook", "light") + 0.1;
      const tHow = cue("hook", "heres");
      const nD = wafer.dies.length;
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = ramp(t, t0, t1);
        const cur = k * nD;
        wafer.paint((d) => clamp(cur - d.order, 0, 1), t * 0.25);
        const d = wafer.dies[Math.min(nD - 1, Math.floor(cur))];
        const vis = k > 0 && k < 1 ? 1 : 0;
        beam.position.set(d.x, 0.03, d.z);
        spot.position.set(d.x, 0.08, d.z);
        beam.material.opacity = 0.5 * vis;
        spot.material.opacity = 0.9 * vis;
        halo.material.opacity = 0.25 * oramp(t, t1, t1 + 1);
        wafer.group.rotation.y = lerp(0.4, 0.15, sramp(t, shot.from, shot.to));
        const up = sramp(t, tHow - 0.3, shot.to);
        W.aim(cam, [lerp(0, 0, up), lerp(5.2, 9.5, up), lerp(7.6, 4.6, up)], [0, lerp(-0.3, -1.6, up), 0]);
      };
    },
  });

  /* ======================= 2a. inside: the processor, lid off, the die ======================= */
  W.shot({
    id: "in-cpu",
    from: () => slot("inside").start,
    to: () => cue("inside", "dive") + 0.45,
    fadeIn: 0.35,
    fadeOut: 0.0,
    setup(shot) {
      const s = W.newScene({ key: 1.5, rim: 1.4 });
      const cam = W.newCamera(30);
      const cpu = new THREE.Group();
      s.add(cpu);
      // LGA package: 37.5 × 45 mm substrate (1 unit = 10 mm)
      const sub = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.12, 4.5), new THREE.MeshStandardMaterial({ color: 0x17382a, roughness: 0.42, metalness: 0.3 }));
      cpu.add(sub);
      const r = W.rng(11);
      const capGeo = new THREE.BoxGeometry(0.1, 0.06, 0.05);
      const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4 }), 60);
      for (let i = 0; i < 60; i++) {
        const side = i % 2 ? 1 : -1;
        _m.makeTranslation(side * (1.62 - r() * 0.12), 0.09, -1.9 + r() * 3.8);
        caps.setMatrixAt(i, _m);
      }
      cpu.add(caps);
      const die = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.05, 1.08), [W.mat.siliconDark, W.mat.siliconDark, new THREE.MeshStandardMaterial({ map: W.dieTex(), metalness: 0.5, roughness: 0.32 }), W.mat.siliconDark, W.mat.siliconDark, W.mat.siliconDark]);
      die.position.y = 0.085;
      cpu.add(die);
      const lid = new THREE.Mesh(W.roundedBox(2.9, 3.4, 0.22, 0.25, 0.04), W.mat.steel);
      lid.rotation.x = -Math.PI / 2;
      lid.position.y = 0.2;
      cpu.add(lid);
      // core outlines over the die (8 P-cores + 16 E-cores), in die-texture coordinates
      const cores = [];
      const dW = 2.38,
        dH = 1.08;
      const toDie = (px, py) => [(px / 1024 - 0.5) * dW, (py / 1024 - 0.5) * dH];
      for (let i = 0; i < 4; i++) for (const y of [60, 560]) cores.push([30 + i * 165, y, 155, 300]);
      for (const [x, y] of [
        [695, 60],
        [845, 60],
        [695, 560],
        [845, 560],
      ])
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) cores.push([x + a * 72, y + b * 150, 72, 150]);
      const outlines = cores.map(([x, y, w, h], k) => {
        const [x0, z0] = toDie(x + 4, y + 4);
        const [x1, z1] = toDie(x + w - 4, y + h - 4);
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, 0, z1), new THREE.Vector3(x0, 0, z0)]);
        const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k < 8 ? C.amber : C.teal, transparent: true, opacity: 0 }));
        l.position.y = 0.112;
        cpu.add(l);
        return l;
      });
      const tLift = cue("inside", "lift") - 0.1;
      const tUnder = cue("inside", "underneath");
      const t26 = cue("inside", "twenty-six");
      const t24 = cue("inside", "twenty-four");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const lift = sramp(t, tLift, tLift + 1.6);
        lid.position.set(lerp(0, 1.2, lift), lerp(0.2, 3.2, lift), lerp(0, -1.0, lift));
        lid.rotation.z = lerp(0, 0.5, lift);
        lid.visible = lift < 0.999;
        cpu.rotation.y = lerp(-0.5, 0, sramp(t, shot.from, tUnder + 1.5));
        const top = sramp(t, tUnder - 0.4, t26);
        const cl = sramp(t, t26, shot.to);
        W.aim(cam, [lerp(3.2, 0, top), lerp(4.2, lerp(4.4, 3.0, cl), top), lerp(6.2, lerp(1.2, 0.9, cl), top)], [0, 0.05, 0]);
        outlines.forEach((l, k) => {
          const tk = t24 + k * 0.045;
          l.material.opacity = oramp(t, tk, tk + 0.25) * 0.95;
        });
      };
      W.label({ shot: "in-cpu", text: "Silicon die", sub: "smaller than a postage stamp", color: C.ink, at: new THREE.Vector3(1.0, 0.1, 0.45), from: tUnder + 0.6, to: t24 - 0.1, dx: 160, dy: 160 });
      W.label({ shot: "in-cpu", text: "24 cores", sub: "8 big + 16 small", color: C.amber, at: new THREE.Vector3(-0.6, 0.11, -0.3), from: t24 - 0.2, to: shot.to + 0.1, dx: -120, dy: -200 });
    },
  });

  /* ======================= 2b. inside: the copper city, 17 layers ======================= */
  W.shot({
    id: "in-metal",
    from: () => cue("inside", "dive") + 0.45,
    to: () => cue("inside", "beneath") - 0.1,
    fadeIn: 0.3,
    fadeOut: 0.0,
    setup(shot) {
      const s = W.newScene({ key: 1.8, rim: 1.6, amb: 0.14, fog: [10, 34] });
      const fill = new THREE.DirectionalLight(0xffe0c8, 1.1);
      fill.position.set(3, 4, 12);
      s.add(fill);
      const cam = W.newCamera(38);
      const r = W.rng(17);
      const SIZE = 7;
      const layers = [];
      const nL = 11; // drawn layers standing in for 17
      let y = 0;
      for (let L = 0; L < nL; L++) {
        const f = L / (nL - 1);
        const pitch = lerp(0.12, 0.95, Math.pow(f, 1.6));
        const width = pitch * 0.5;
        const th = lerp(0.07, 0.34, Math.pow(f, 1.4));
        const gapAbove = lerp(0.16, 0.55, f);
        layers.push({ y: y + th / 2, pitch, width, th, dir: L % 2 });
        y += th + gapAbove;
      }
      const stackH = y;
      const wires = [];
      for (const ly of layers) {
        const n = Math.floor(SIZE / ly.pitch);
        for (let i = 0; i < n; i++) {
          const off = -SIZE / 2 + (i + 0.5) * ly.pitch;
          let a = -SIZE / 2;
          while (a < SIZE / 2) {
            const len = Math.min(SIZE / 2 - a, 0.4 + r() * SIZE * (0.15 + ly.pitch * 0.2));
            if (r() > 0.18) wires.push({ ly, off, a, len });
            a += len + ly.pitch * (0.4 + r());
          }
        }
      }
      const wireMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), W.mat.copper, wires.length);
      wires.forEach((w, k) => {
        const c = w.a + w.len / 2;
        if (w.ly.dir === 0) _m.compose(_p.set(c, w.ly.y, w.off), _q.identity(), _s.set(w.len, w.ly.th, w.ly.width));
        else _m.compose(_p.set(w.off, w.ly.y, c), _q.identity(), _s.set(w.ly.width, w.ly.th, w.len));
        wireMesh.setMatrixAt(k, _m);
      });
      s.add(wireMesh);
      // vias between neighbouring layers
      const vias = [];
      for (let L = 0; L < nL - 1; L++) {
        const a = layers[L],
          b = layers[L + 1];
        const n = Math.floor(260 / (1 + L * 0.9));
        for (let k = 0; k < n; k++) {
          const x = -SIZE / 2 + r() * SIZE,
            z = -SIZE / 2 + r() * SIZE;
          const px = a.dir === 1 ? Math.round((x + SIZE / 2) / a.pitch - 0.5) * a.pitch - SIZE / 2 + a.pitch / 2 : x;
          const pz = a.dir === 0 ? Math.round((z + SIZE / 2) / a.pitch - 0.5) * a.pitch - SIZE / 2 + a.pitch / 2 : z;
          vias.push({ x: px, z: pz, y0: a.y + a.th / 2, y1: b.y - b.th / 2, w: Math.min(a.width, b.width) * 0.8 });
        }
      }
      const viaMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8a7f74, metalness: 0.9, roughness: 0.45 }), vias.length);
      vias.forEach((v, k) => {
        _m.compose(_p.set(v.x, (v.y0 + v.y1) / 2, v.z), _q.identity(), _s.set(v.w, v.y1 - v.y0, v.w));
        viaMesh.setMatrixAt(k, _m);
      });
      s.add(viaMesh);
      // transistor floor
      const floor = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 0.3, SIZE), W.mat.siliconDark);
      floor.position.y = -0.25;
      s.add(floor);
      const glow = W.glow(C.copper, 18, 0.12);
      glow.position.set(0, stackH * 0.4, 0);
      s.add(glow);

      const tDive = shot.from;
      const tCity = cue("inside", "city");
      const t17 = cueEnd("inside", "deep") + 0.2;
      const tFine = cue("inside", "fine") - 0.2;
      const tEnd = shot.to;
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // fall down the cut face of the stack, layer after layer
        const k = sramp(t, tDive, t17);
        const yy = lerp(stackH + 4.2, 0.7, k);
        const o = sramp(t, tFine - 0.3, tFine + 1.8);
        const pos = [lerp(lerp(0.4, 1.6, k), 10.5, o), lerp(yy, stackH * 0.62, o), lerp(SIZE / 2 + lerp(7.0, 2.4, k), 10.5, o)];
        const look = [lerp(lerp(0, -0.8, k), 0, o), lerp(yy - lerp(4.6, 0.5, k), stackH * 0.4, o), lerp(0, 0, o)];
        W.aim(cam, pos, look);
        s.fog.near = lerp(lerp(10, 5, k), 14, o);
        s.fog.far = lerp(lerp(28, 14, k), 40, o);
      };
      const lyTop = layers[nL - 1],
        lyMid = layers[5],
        lyBot = layers[0];
      W.label({ shot: "in-metal", text: "Global wiring", sub: "widest, at the top", color: C.copper, at: new THREE.Vector3(SIZE / 2, lyTop.y, SIZE / 2 - 0.5), from: cue("inside", "wide") - 0.2, to: tEnd, dx: 170, dy: 10 });
      W.label({ shot: "in-metal", text: "Intermediate", sub: "across a core", color: C.copper, at: new THREE.Vector3(SIZE / 2, lyMid.y, SIZE / 2 - 0.4), from: tFine + 0.9, to: tEnd, dx: 190, dy: 0 });
      W.label({ shot: "in-metal", text: "Local wiring", sub: "finest, at the bottom", color: C.copper, at: new THREE.Vector3(SIZE / 2, lyBot.y, SIZE / 2 - 0.3), from: tFine + 0.2, to: tEnd, dx: 170, dy: -10 });
      W.label({ shot: "in-metal", text: "Metal layers", sub: "17", big: true, color: C.ink, at: new THREE.Vector3(-SIZE / 2, stackH * 0.55, SIZE / 2), from: tFine + 1.2, to: tEnd, dx: -170, dy: 40 });
    },
  });

  /* ======================= 2c. inside: FinFETs ======================= */
  W.shot({
    id: "in-fins",
    from: () => cue("inside", "beneath") - 0.1,
    to: () => slot("inside").end,
    fadeIn: 0.25,
    fadeOut: 0.35,
    setup(shot) {
      const s = W.newScene({ key: 1.6, rim: 1.8, amb: 0.1, fog: [34, 80] });
      const cam = W.newCamera(34);
      // 1 unit = 10 nm. fins 6 nm wide (0.6), 52 nm tall-ish channel (shown as 4.2), gates every 57 nm (5.7)
      const finPitch = 3.4,
        gatePitch = 5.7;
      const nF = 7,
        nG = 6;
      const span = 34;
      const subst = new THREE.Mesh(new THREE.BoxGeometry(span, 2, span), W.mat.siliconDark);
      subst.position.y = -1;
      s.add(subst);
      const sti = new THREE.Mesh(new THREE.BoxGeometry(span, 1.2, span), new THREE.MeshStandardMaterial({ color: 0x3e5866, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 }));
      sti.position.y = 0.6;
      s.add(sti);
      const finMat = new THREE.MeshStandardMaterial({ color: 0xa8d8f0, metalness: 0.3, roughness: 0.3, emissive: 0x0d2233 });
      const fins = [];
      for (let i = 0; i < nF; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.6, span), finMat);
        f.position.set((i - (nF - 1) / 2) * finPitch, 2.3, 0);
        s.add(f);
        fins.push(f);
      }
      const gateMat = new THREE.MeshStandardMaterial({ color: 0x7b6be6, metalness: 0.4, roughness: 0.35, emissive: 0x1a1240, transparent: true, opacity: 0.72 });
      const spacerMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e0, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.45 });
      const gates = [];
      for (let j = 0; j < nG; j++) {
        const z = (j - (nG - 1) / 2) * gatePitch;
        const gate = new THREE.Mesh(new THREE.BoxGeometry(nF * finPitch + 2, 5.4, 1.6), gateMat);
        gate.position.set(0, 3.3, z);
        s.add(gate);
        for (const sz of [-1, 1]) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(nF * finPitch + 2, 5.4, 0.45), spacerMat);
          sp.position.set(0, 3.3, z + sz * 1.02);
          s.add(sp);
        }
        gates.push(gate);
        // copper contacts between gates, landing on the fins
        if (j < nG - 1) {
          const cz = z + gatePitch / 2;
          const ct = new THREE.Mesh(new THREE.BoxGeometry(nF * finPitch * 0.62, 1.4, 1.0), W.mat.copper);
          ct.position.set(0, 5.3, cz);
          s.add(ct);
        }
      }
      const tBen = shot.from;
      const tFins = cue("inside", "fins");
      const tSix = cue("inside", "six");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = sramp(t, tBen, shot.to);
        const ang = lerp(-0.7, -0.4, k);
        const rad = lerp(40, 31, k);
        W.aim(cam, [Math.sin(ang) * rad, lerp(30, 24, k), Math.cos(ang) * rad], [0, 1.5, 0]);
        const h = oramp(t, tFins, tFins + 0.5);
        finMat.emissive.setRGB(0.05 + 0.18 * h, 0.13 + 0.3 * h, 0.2 + 0.4 * h);
      };
      W.label({ shot: "in-fins", text: "Silicon fin", sub: "6 nm wide", color: C.sky, at: new THREE.Vector3(fins[nF - 1].position.x + 0.3, 4.6, 0), from: tFins + 0.1, to: shot.to, dx: 210, dy: 40 });
      W.label({ shot: "in-fins", text: "Gate", sub: "the switch", color: C.violet, at: new THREE.Vector3(-8, 6.8, gates[3].position.z), from: tSix + 0.3, to: shot.to, dx: -200, dy: -120 });
    },
  });

  /* ======================= 3. challenge: eighty layers ======================= */
  W.layerTex = function (k) {
    return W.canvasTex(256, 256, (g, w, h) => {
      const r = W.rng(100 + k);
      g.fillStyle = k % 2 ? "#2a3742" : "#3a2a20";
      g.fillRect(0, 0, w, h);
      const kind = k % 4;
      g.fillStyle = k % 2 ? "#9fd3e6" : "#e0894b";
      if (kind === 0) for (let x = 0; x < w; x += 10) g.fillRect(x, 0, 4, h);
      if (kind === 1) for (let y = 0; y < h; y += 14) for (let x = 0; x < w; ) { const l = 20 + r() * 80; g.fillRect(x, y, l, 6); x += l + 8 + r() * 20; }
      if (kind === 2) for (let i = 0; i < 260; i++) g.fillRect(Math.floor(r() * 32) * 8, Math.floor(r() * 32) * 8, 5, 5);
      if (kind === 3) for (let x = 0; x < w; ) { const l = 20 + r() * 80; for (let y = 0; y < h; y += 18) g.fillRect(x, y, 8, 12); x += 26; }
    });
  };
  W.shot({
    id: "stack",
    from: () => slot("challenge").start,
    to: () => slot("challenge").end,
    setup(shot) {
      const s = W.newScene({ key: 1.4, rim: 1.5 });
      const cam = W.newCamera(30);
      const texes = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => W.layerTex(k));
      const mats = texes.map((tx, k) => new THREE.MeshStandardMaterial({ map: tx, metalness: k % 2 ? 0.2 : 0.7, roughness: 0.4, transparent: true, opacity: 1 }));
      const N = 80;
      const th = 0.045;
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 3.2), W.mat.silicon);
      base.position.y = -0.25;
      s.add(base);
      const slabs = [];
      for (let i = 0; i < N; i++) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(3.2, th, 3.2), mats[i % 8]);
        sl.rotation.y = (i % 3) * (Math.PI / 2);
        s.add(sl);
        slabs.push(sl);
      }
      const dust = W.glow(0xfff2d0, 0.5, 0);
      const dustCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 2), new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 1 }));
      s.add(dust, dustCore);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 64), W.basic(C.coral, 0, false));
      ring.rotation.x = -Math.PI / 2;
      s.add(ring);
      const tStack = cue("challenge", "stacks") - 0.2;
      const tStackEnd = cueEnd("challenge", "layers") + 0.8;
      const tAlign = cue("challenge", "aligned");
      const tSpeck = cue("challenge", "speck");
      const tRuin = cue("challenge", "ruin");
      const topY = N * th;
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        for (let i = 0; i < N; i++) {
          const ti = tStack + (i / N) * (tStackEnd - tStack);
          const k = oramp(t, ti, ti + 0.35);
          slabs[i].position.y = i * th + th / 2 + (1 - k) * 1.6;
          slabs[i].material.opacity = 1;
          slabs[i].visible = k > 0.001;
          slabs[i].scale.setScalar(1);
        }
        const k = sramp(t, shot.from, tAlign);
        const a = sramp(t, tAlign - 0.3, tAlign + 1.6) * (1 - sramp(t, tSpeck - 1.2, tSpeck));
        const ang = lerp(0.9, 0.45, sramp(t, shot.from, shot.to));
        const d = lerp(lerp(10.5, 8.4, k), 3.3, a);
        const ty = lerp(1.6, topY * 0.9, a);
        W.aim(cam, [Math.sin(ang) * d + lerp(0, 1.4, a), lerp(lerp(5.8, 6.2, k), topY + 0.8, a), Math.cos(ang) * d], [lerp(0, 1.4, a), ty, lerp(0, 1.4, a)]);
        // the speck of dust falls onto the top layer
        const f = ramp(t, tSpeck - 0.2, tRuin);
        const dy = lerp(3.5, topY + 0.09, easeOut(f));
        dust.position.set(0.6, dy, 0.5);
        dustCore.position.copy(dust.position);
        dust.material.opacity = f > 0 ? 0.9 : 0;
        dustCore.visible = f > 0;
        ring.position.set(0.6, topY + 0.01, 0.5);
        ring.material.opacity = oramp(t, tRuin, tRuin + 0.3) * 0.95;
        const sc = 1 + 0.4 * oramp(t, tRuin, tRuin + 0.5);
        ring.scale.set(sc, sc, sc);
      };
      W.label({ shot: "stack", text: "Mask layers", sub: "≈ 80", big: true, color: C.ink, at: new THREE.Vector3(-1.6, topY * 0.55, 1.6), from: tStackEnd - 0.4, to: tAlign - 0.2, dx: -150, dy: -40 });
      W.label({ shot: "stack", text: "Each aligned within", sub: "a few nanometers", color: C.sky, at: new THREE.Vector3(1.6, topY - 0.2, 1.6), from: tAlign + 0.7, to: tSpeck - 1.1, dx: 160, dy: -120 });
      W.label({ shot: "stack", text: "One speck of dust", sub: "one ruined chip", color: C.coral, at: new THREE.Vector3(0.6, topY + 0.1, 0.5), from: tRuin + 0.1, to: shot.to, dx: 180, dy: -110 });
    },
  });
})();
