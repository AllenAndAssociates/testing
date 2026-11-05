/* Chapters 4–5: one layer, step by step (cross-section), and the six-family loop. */
(function () {
  const THREE = window.THREE;
  const W = window.World;
  const { clamp, lerp, ramp, sramp, oramp, win, ease, easeOut } = W.m;
  const C = W.C;
  const cue = W.cue,
    cueEnd = W.cueEnd,
    slot = W.slot;
  const _c = new THREE.Color();

  /* ======================= shared: a cross-section of one metal layer ======================= */
  // X runs across the cut, Z into the screen. The base holds the previous layer's vias.
  W.makeSection = function (opts = {}) {
    const g = new THREE.Group();
    const X0 = -6,
      X1 = 6,
      D = 4;
    const OX = 1.0; // oxide thickness
    const RS = 0.42; // resist thickness
    const trenches = opts.trenches || [
      [-4.4, 0.9],
      [-2.2, 0.55],
      [0.2, 1.35],
      [2.75, 0.7],
      [4.6, 0.55],
    ];
    const base = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 1.6, D), new THREE.MeshStandardMaterial({ color: 0x55616e, metalness: 0.35, roughness: 0.55 }));
    base.position.y = -0.8;
    g.add(base);
    // previous layer: vias that the new trenches land on
    for (const [cx, w] of trenches) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.4, w * 0.6), 0.9, D * 0.999), W.mat.copper);
      v.position.set(cx, -0.45, 0);
      g.add(v);
    }
    // oxide: split into kept spans and trench spans
    const cuts = [];
    let x = X0;
    for (const [cx, w] of trenches) {
      cuts.push({ a: x, b: cx - w / 2, trench: false });
      cuts.push({ a: cx - w / 2, b: cx + w / 2, trench: true });
      x = cx + w / 2;
    }
    cuts.push({ a: x, b: X1, trench: false });
    const oxMat = new THREE.MeshPhysicalMaterial({ color: 0x8fd0e6, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.55, depthWrite: true });
    const oxide = cuts.map((c) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.b - c.a, 1, D), oxMat);
      m.position.x = (c.a + c.b) / 2;
      g.add(m);
      return Object.assign(m, { cut: c });
    });
    // resist: thin slices so it can spread from the centre during spin-on
    const slices = [];
    const SL = 0.25;
    for (let sx = X0; sx < X1 - 1e-6; sx += SL) {
      const mid = sx + SL / 2;
      const exposed = trenches.some(([cx, w]) => Math.abs(mid - cx) < w / 2);
      const mat = new THREE.MeshStandardMaterial({ color: C.resist, roughness: 0.5, metalness: 0, emissive: 0x000000 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(SL * 1.001, 1, D), mat);
      m.position.x = mid;
      g.add(m);
      slices.push(Object.assign(m, { mid, exposed }));
    }
    // copper fill and overburden
    const fills = trenches.map(([cx, w]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, D), W.mat.copper);
      m.position.x = cx;
      g.add(m);
      return m;
    });
    const over = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 1, D), W.mat.copper);
    g.add(over);
    // photomask plate and UV beams
    const mask = new THREE.Group();
    const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 1, 0.12, D + 1), plateMat);
    mask.add(plate);
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.8, roughness: 0.3 });
    let mx = X0 - 0.5;
    for (const [cx, w] of trenches.concat([[X1 + 0.5 + 0.0001, 0]])) {
      const a = mx,
        b = cx - w / 2;
      if (b - a > 0.01) {
        const ch = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.05, D + 1), chromeMat);
        ch.position.set((a + b) / 2, -0.085, 0);
        mask.add(ch);
      }
      mx = cx + w / 2;
    }
    mask.position.y = 4.2;
    g.add(mask);
    const beams = trenches.map(([cx, w]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 1, D * 0.98), W.basic(C.uv, 0, true));
      m.position.x = cx;
      g.add(m);
      return m;
    });
    const lamp = W.glow(C.uv, 10, 0);
    lamp.position.set(0, 7.5, 0);
    g.add(lamp);
    const plasma = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 1.6, D), W.basic(0xff4fa3, 0, true));
    plasma.position.y = 2.6;
    g.add(plasma);
    // polishing pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9, metalness: 0.1 }));
    g.add(pad);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.06, 8, 64), W.basic(C.coral, 0.9));
    padRing.rotation.x = Math.PI / 2;
    pad.add(padRing);

    const S = { group: g, oxide, slices, fills, over, mask, beams, lamp, plasma, pad, trenches, OX, RS, X0, X1, D };
    // state: every field 0..1
    S.set = function (st) {
      const ox = st.oxide; // 0..1 growth
      for (const m of oxide) {
        let h = OX * ox;
        if (m.cut.trench) h *= 1 - st.etch;
        m.scale.y = Math.max(0.0001, h);
        m.position.y = h / 2;
        m.visible = h > 0.001;
      }
      const top = OX * ox;
      for (const m of slices) {
        const spread = Math.abs(m.mid) < st.spread * 6.3 ? 1 : 0;
        let h = RS * st.resist * spread;
        if (m.exposed) h *= 1 - st.develop;
        h *= 1 - st.strip;
        m.scale.y = Math.max(0.0001, h);
        m.position.y = top + h / 2;
        m.visible = h > 0.002;
        const e = m.exposed ? st.exposed : 0;
        m.material.color.setHex(C.resist).lerp(_c.setHex(0xd9c7ff), e * 0.75);
        m.material.emissive.setRGB(0.25 * e, 0.15 * e, 0.45 * e);
      }
      for (const m of fills) {
        const h = OX * st.fill;
        m.scale.y = Math.max(0.0001, h);
        m.position.y = h / 2;
        m.visible = h > 0.001;
      }
      const ob = 0.32 * st.fill * (1 - st.polish);
      over.scale.y = Math.max(0.0001, ob);
      over.position.y = OX + ob / 2;
      over.visible = ob > 0.002;
      mask.visible = st.mask > 0.001;
      mask.position.y = lerp(9, 4.2, st.mask) + (st.maskX ? 0 : 0);
      mask.position.x = st.maskX || 0;
      plate.material.opacity = 0.25 * st.mask;
      for (const b of beams) {
        const y0 = top + RS;
        const y1 = 4.1;
        b.scale.y = y1 - y0;
        b.position.y = (y0 + y1) / 2;
        b.material.opacity = 0.42 * st.uv;
      }
      lamp.material.opacity = st.uv;
      plasma.material.opacity = 0.3 * st.plasma;
      pad.visible = st.pad > 0.001;
      pad.position.set(lerp(-11, 11, st.padX), OX + 0.25 + 0.01 + 0.32 * (1 - st.polish) * st.fill, 0);
      pad.rotation.y = st.padSpin || 0;
    };
    return S;
  };
  W.sectionState = () => ({ oxide: 0, spread: 0, resist: 0, exposed: 0, develop: 0, etch: 0, strip: 0, fill: 0, polish: 0, mask: 0, uv: 0, plasma: 0, pad: 0, padX: 0, padSpin: 0 });

  /* ======================= 4. recipe ======================= */
  W.shot({
    id: "recipe",
    from: () => slot("recipe").start,
    to: () => slot("recipe").end,
    setup(shot) {
      const s = W.newScene({ key: 1.8, rim: 1.4, amb: 0.2 });
      const cam = W.newCamera(30);
      const sec = W.makeSection();
      s.add(sec.group);
      const T = {
        coat: cue("recipe", "coat"),
        spin: cue("recipe", "spin"),
        shine: cue("recipe", "shine"),
        wash: cue("recipe", "wash"),
        etch: cue("recipe", "etch"),
        strip: cue("recipe", "strip"),
        flood: cue("recipe", "flood"),
        polish: cue("recipe", "polish"),
        remain: cue("recipe", "remain"),
        one: cue("recipe", "one"),
        swap: cue("recipe", "swap"),
      };
      shot.T = T;
      const st = W.sectionState();
      // second layer, for "swap the mask, and go again"
      const sec2 = W.makeSection({
        trenches: [
          [-3.6, 0.4],
          [-0.9, 0.4],
          [1.6, 0.4],
          [3.9, 0.4],
        ],
      });
      sec2.group.position.y = sec.OX + 0.001;
      sec2.group.children[0].visible = false;
      s.add(sec2.group);
      sec2.group.children.forEach((c, i) => {
        if (i > 0 && i <= sec2.trenches.length) c.visible = false;
      });
      const st2 = W.sectionState();
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        st.oxide = sramp(t, T.coat + 0.3, T.coat + 2.0);
        st.spread = sramp(t, T.spin + 0.2, T.spin + 1.6);
        st.resist = st.spread > 0 ? 1 : 0;
        st.mask = sramp(t, T.shine - 0.2, T.shine + 0.9) * (1 - sramp(t, T.wash - 0.4, T.wash + 0.3));
        st.uv = win(t, T.shine + 0.8, T.wash - 0.3, 0.25, 0.3);
        st.exposed = sramp(t, T.shine + 1.0, T.shine + 2.0);
        st.develop = sramp(t, T.wash + 0.2, T.wash + 1.4);
        st.etch = sramp(t, T.etch + 0.2, T.etch + 1.7);
        st.plasma = win(t, T.etch, T.etch + 2.0, 0.25, 0.4);
        st.strip = sramp(t, T.strip + 0.1, T.strip + 1.1);
        st.fill = sramp(t, T.flood + 0.1, T.flood + 1.4);
        st.padX = ramp(t, T.polish + 0.1, T.remain + 0.2);
        st.pad = st.padX > 0 && st.padX < 1 ? 1 : 0;
        st.padSpin = t * 4;
        st.polish = sramp(t, T.polish + 0.6, T.remain - 0.1);
        sec.set(st);
        // next layer begins
        st2.oxide = sramp(t, T.swap + 0.2, T.swap + 1.4);
        st2.mask = sramp(t, T.swap - 0.2, T.swap + 0.8);
        st2.maskX = lerp(-14, 0, sramp(t, T.swap - 0.2, T.swap + 0.8));
        sec2.set(st2);
        sec2.group.visible = t > T.swap - 0.3;
        // camera: three-quarter view of the cut, easing in during the work, pulling up for "go again"
        const k = sramp(t, shot.from, T.coat + 1.5);
        const up = sramp(t, T.one - 0.3, shot.to);
        const yaw = lerp(0.62, 0.42, sramp(t, shot.from, shot.to));
        const d = lerp(lerp(23, 20.5, k), 21.5, up);
        W.aim(cam, [Math.sin(yaw) * d, lerp(lerp(8.0, 6.2, k), 8.2, up), Math.cos(yaw) * d], [0, lerp(0.55, 1.2, up), 0]);
      };
      const L = (text, sub, color, at, from, to, dx, dy) => W.label({ shot: "recipe", text, sub, color, at, from, to, dx, dy });
      L("Silicon dioxide", "insulator", C.teal, new THREE.Vector3(-5.2, 0.8, 2), T.coat + 1.2, T.spin, -150, -120);
      L("Photoresist", "light-sensitive", C.amber, new THREE.Vector3(-5.2, 1.25, 2), T.spin + 1.0, T.shine, -150, -130);
      L("Photomask", "the stencil", C.amber, new THREE.Vector3(-5.6, 4.2, 2.4), T.shine + 0.9, T.wash - 0.4, -120, -110);
      L("Ultraviolet light", "", C.uv, new THREE.Vector3(0.2, 2.8, 2), T.shine + 1.3, T.wash - 0.4, 220, -40);
      L("Copper", "fills the trenches", C.copper, new THREE.Vector3(4.6, 0.6, 2), T.flood + 0.4, T.polish + 0.3, 170, 90);
      L("One finished layer", "copper wires set in glass", C.copper, new THREE.Vector3(0.2, 0.5, 2), T.remain + 0.2, T.swap - 0.1, 180, 150);
    },
  });

  /* ======================= 5. the loop: six families ======================= */
  W.FAM = [
    { id: "litho", name: "Lithography", verb: "pattern", color: C.amber, word: "lithography" },
    { id: "dep", name: "Deposition", verb: "add", color: C.teal, word: "deposition" },
    { id: "remove", name: "Etch & polish", verb: "remove", color: C.coral, word: "etching" },
    { id: "modify", name: "Ion implant", verb: "modify", color: C.violet, word: "ion" },
    { id: "clean", name: "Clean", verb: "wash", color: C.sky, word: "washers" },
    { id: "inspect", name: "Metrology", verb: "inspect", color: C.lime, word: "metrology" },
  ];
  W.makeTool = function (color, w = 1.8, h = 1.5, d = 1.4) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(W.roundedBox(w, h, d, 0.12, 0.03), W.mat.white);
    body.position.y = h / 2;
    g.add(body);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, h * 0.32), new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.2, metalness: 0.5 }));
    win.position.set(0, h * 0.55, d / 2 + 0.002);
    g.add(win);
    const stripMat = new THREE.MeshBasicMaterial({ color });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.002, 0.08, d * 1.002), stripMat);
    strip.position.y = h * 0.86;
    g.add(strip);
    const port = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.08, 0.5), W.mat.dark);
    port.position.set(0, h * 0.35, d / 2 + 0.25);
    g.add(port);
    g.userData = { strip, stripMat, body, h };
    return g;
  };
  W.shot({
    id: "loop",
    from: () => slot("loop").start,
    to: () => slot("loop").end,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.2, amb: 0.16 });
      const cam = W.newCamera(32);
      const RAD = 5;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 96), new THREE.MeshStandardMaterial({ color: 0x0c1015, roughness: 0.85, metalness: 0.1 }));
      floor.rotation.x = -Math.PI / 2;
      s.add(floor);
      const track = new THREE.Mesh(new THREE.TorusGeometry(RAD - 1.6, 0.04, 8, 160), W.basic(0x3a4552, 1));
      track.rotation.x = Math.PI / 2;
      track.position.y = 0.02;
      s.add(track);
      const arcs = [];
      const tools = W.FAM.map((f, i) => {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const tool = W.makeTool(f.color);
        tool.position.set(Math.cos(a) * RAD, 0, Math.sin(a) * RAD);
        tool.lookAt(0, 0, 0);
        s.add(tool);
        const gl = W.glow(f.color, 3.2, 0);
        gl.position.set(tool.position.x, 1.4, tool.position.z);
        s.add(gl);
        // a coloured arc of track in front of each tool
        const arc = new THREE.Mesh(new THREE.TorusGeometry(RAD - 1.6, 0.075, 8, 40, (Math.PI * 2) / 6 - 0.12), W.basic(f.color, 0));
        arc.rotation.x = Math.PI / 2;
        arc.rotation.z = -(a - Math.PI / 6 + 0.06) - 0; // align around the station
        arc.rotation.z = a - Math.PI / 6 + 0.06;
        arc.position.y = 0.03;
        s.add(arc);
        arcs.push(arc);
        return { tool, gl, a, f, t: cue("loop", f.word) };
      });
      const puck = new THREE.Group();
      const pw = W.makeWafer();
      pw.group.scale.setScalar(0.22);
      puck.add(pw.group);
      const pg = W.glow(0xffffff, 1.4, 0.35);
      puck.add(pg);
      s.add(puck);
      const tLoop = cue("loop", "around") - 0.2;
      const tEnd = cueEnd("loop", "stops");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // the wafer visits each station as it is named, then laps the loop eighty times (shown fast)
        let ang;
        const named = tools.map((x) => x.t);
        if (t < tLoop) {
          let i = 0;
          while (i < 5 && t >= named[i + 1] - 0.4) i++;
          const a0 = tools[i].a;
          const a1 = i < 5 ? tools[i + 1].a : tools[0].a + Math.PI * 2;
          const k = i < 5 ? sramp(t, named[i + 1] - 0.9, named[i + 1] - 0.1) : 0;
          ang = t < named[0] - 0.9 ? tools[0].a - 0.5 * (1 - sramp(t, shot.from, named[0] - 0.2)) : lerp(a0, a1, k);
        } else {
          const k = Math.pow(ramp(t, tLoop, tEnd + 0.6), 1.6);
          ang = tools[5].a + k * Math.PI * 2 * 12;
        }
        puck.position.set(Math.cos(ang) * (RAD - 1.6), 0.08, Math.sin(ang) * (RAD - 1.6));
        puck.rotation.y = -ang;
        const lapping = t >= tLoop ? oramp(t, tLoop, tLoop + 1) : 0;
        tools.forEach((x, i) => {
          const on = oramp(t, x.t - 0.1, x.t + 0.4);
          const near = Math.max(0, Math.cos(ang - x.a)) ** 40;
          x.gl.material.opacity = on * 0.25 + near * 0.6 * on + lapping * 0.15;
          arcs[i].material.opacity = on * 0.95;
          x.tool.userData.stripMat.color.setHex(x.f.color).multiplyScalar(0.25 + on * 0.75);
        });
        track.material.color.setHex(0x3a4552).lerp(_c.setHex(0xffffff), lapping * 0.5);
        const yaw = lerp(0.2, 0.9, sramp(t, shot.from, shot.to));
        const d = lerp(17, 15.5, sramp(t, shot.from, shot.to));
        W.aim(cam, [Math.sin(yaw) * d, lerp(11, 12.5, sramp(t, tLoop, shot.to)), Math.cos(yaw) * d], [0, 0.2, 0]);
      };
      tools.forEach((x) => {
        W.label({ shot: "loop", text: x.f.name, sub: x.f.verb, color: x.f.color, at: new THREE.Vector3(x.tool.position.x, 1.6, x.tool.position.z), from: x.t, to: shot.to, dx: x.tool.position.x >= -0.1 ? 110 : -110, dy: -70 });
      });
    },
  });
})();
