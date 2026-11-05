/* Chapters 10–12: where wafers come from, testing and packaging, the outro. */
(function () {
  const THREE = window.THREE;
  const W = window.World;
  const { clamp, lerp, ramp, sramp, oramp, win, ease, easeOut, easeIn } = W.m;
  const C = W.C;
  const cue = W.cue,
    cueEnd = W.cueEnd,
    slot = W.slot;
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _p = new THREE.Vector3(),
    _s = new THREE.Vector3(),
    _e = new THREE.Euler(),
    _c = new THREE.Color();

  function lumpy(geo, seed, amt) {
    const r = W.rng(seed);
    const pos = geo.attributes.position;
    const map = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!map.has(key)) map.set(key, 1 + (r() - 0.5) * amt);
      const k = map.get(key);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ======================= 10a. quartz to silicon ======================= */
  W.shot({
    id: "wafer-raw",
    from: () => slot("wafer").start,
    to: () => cue("wafer", "grown") - 0.15,
    setup(shot) {
      const s = W.newScene({ key: 1.6, rim: 1.6, amb: 0.12 });
      const cam = W.newCamera(30);
      const quartz = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(1.3, 2), 3, 0.45), new THREE.MeshPhysicalMaterial({ color: 0xe9e1d3, roughness: 0.35, metalness: 0, clearcoat: 0.4, flatShading: true }));
      quartz.position.set(-2.4, 0, 0);
      s.add(quartz);
      const chunks = [];
      const r = W.rng(14);
      for (let i = 0; i < 7; i++) {
        const c = new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(0.45 + r() * 0.35, 0), 20 + i, 0.5), new THREE.MeshStandardMaterial({ color: 0xc4ccd5, metalness: 0.65, roughness: 0.28, flatShading: true }));
        c.position.set(2.4 + (r() - 0.5) * 1.6, -0.6 + r() * 1.0, (r() - 0.5) * 1.4);
        c.rotation.set(r() * 3, r() * 3, r() * 3);
        s.add(c);
        chunks.push(c);
      }
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 24), W.basic(C.ink, 0));
      arrow.rotation.z = -Math.PI / 2;
      arrow.position.set(0.05, 0, 0);
      s.add(arrow);
      const tRef = cue("wafer", "refined");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = oramp(t, tRef - 0.1, tRef + 0.9);
        chunks.forEach((c, i) => c.scale.setScalar(Math.max(0.0001, oramp(t, tRef + i * 0.08, tRef + 0.6 + i * 0.08))));
        arrow.material.opacity = k;
        quartz.rotation.y = t * 0.25;
        W.aim(cam, [0, 1.6, lerp(10, 8.8, sramp(t, shot.from, shot.to))], [0, 0, 0]);
      };
      W.label({ shot: "wafer-raw", text: "Quartz", sub: "the raw material", color: 0xe9e1d3, at: new THREE.Vector3(-2.4, 1.2, 0), from: cue("wafer", "quartz"), to: shot.to, dx: -110, dy: -120 });
      W.label({ shot: "wafer-raw", text: "Ultra-pure silicon", sub: "refined", color: C.sky, at: new THREE.Vector3(2.6, 0.6, 0), from: tRef + 0.6, to: shot.to, dx: 110, dy: -140 });
    },
  });

  /* ======================= 10b. growing a single crystal ======================= */
  W.shot({
    id: "wafer-grow",
    from: () => cue("wafer", "grown") - 0.15,
    to: () => cue("wafer", "sliced") - 0.15,
    fadeIn: 0.3,
    fadeOut: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 1.0, rim: 1.4, amb: 0.08 });
      const cam = W.newCamera(30);
      W.renderer.localClippingEnabled = true;
      const melt = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      // ingot profile: neck, shoulder, body, tail (radius, y)
      const prof = [
        [0.0, 6.6],
        [0.08, 6.6],
        [0.08, 5.9],
        [0.4, 5.6],
        [0.95, 5.0],
        [1.0, 4.7],
        [1.0, 0.6],
        [0.8, 0.2],
        [0.0, 0.0],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const ingot = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.75, roughness: 0.22, clippingPlanes: [melt] }));
      s.add(ingot);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8, 12), W.mat.steel);
      s.add(rod);
      const crucible = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.8, 1.6, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.6, side: THREE.DoubleSide }));
      crucible.position.y = -0.7;
      s.add(crucible);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.95, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3d).multiplyScalar(1.6) }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = -0.05;
      s.add(pool);
      const glow = W.glow(0xff7a2e, 9, 0.55);
      glow.position.y = 0.2;
      s.add(glow);
      const heatLight = new THREE.PointLight(0xff7a2e, 20, 12, 1.5);
      heatLight.position.y = 0.6;
      s.add(heatLight);
      const tFlaw = cue("wafer", "flawless");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = sramp(t, shot.from, shot.to);
        // the crystal rises out of the melt, turning slowly
        const lift = lerp(-4.2, 0.6, k);
        ingot.position.y = lift;
        ingot.rotation.y = t * 0.6;
        rod.position.y = lift + 6.6 + 4;
        W.aim(cam, [lerp(5.5, 4.2, k), lerp(3.2, 4.4, k), lerp(12.5, 11.5, k)], [0, lerp(1.2, 2.6, k), 0]);
      };
      W.label({ shot: "wafer-grow", text: "Single crystal", sub: "pulled from molten silicon", color: C.ink, at: () => new THREE.Vector3(1.0, Math.max(0.6, ingot.position.y + 3), 0), from: tFlaw - 0.2, to: shot.to, dx: 170, dy: -60 });
    },
  });

  /* ======================= 10c. slicing wafers ======================= */
  function notchedDisc(R, th) {
    const sh = new THREE.Shape();
    const n = 0.06;
    sh.absarc(0, 0, R, -Math.PI / 2 + n / R, (3 * Math.PI) / 2 - n / R, false);
    sh.lineTo(0, -R + n * 1.2);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 96 });
    g.translate(0, 0, -th / 2);
    return g;
  }
  W.shot({
    id: "wafer-slice",
    from: () => cue("wafer", "sliced") - 0.15,
    to: () => cue("wafer", "blank") - 0.15,
    fadeIn: 0.25,
    fadeOut: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 1.5, rim: 1.6, amb: 0.12 });
      const cam = W.newCamera(30);
      const R = 1.0;
      const ingot = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 4, 96), new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.75, roughness: 0.22 }));
      ingot.rotation.z = Math.PI / 2;
      s.add(ingot);
      const discGeo = notchedDisc(R, 0.03);
      const discMat = new THREE.MeshStandardMaterial({ color: 0xb4bec9, metalness: 0.9, roughness: 0.12 });
      const N = 14;
      const discs = [];
      for (let i = 0; i < N; i++) {
        const d = new THREE.Mesh(discGeo, discMat);
        s.add(d);
        discs.push(d);
      }
      const saw = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 3), W.basic(C.sky, 0, true));
      s.add(saw);
      const tDiscs = cue("wafer", "discs");
      const tNotch = cue("wafer", "notch");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const end = 2.0; // ingot's right face
        discs.forEach((d, i) => {
          const ti = shot.from + 0.2 + i * 0.32;
          const k = oramp(t, ti, ti + 0.9);
          const x = lerp(end - 0.02, end + 0.6 + i * 0.32, k);
          d.position.set(x, 0, 0);
          d.rotation.set(0, Math.PI / 2, 0);
          d.visible = t > ti;
        });
        // the hero wafer turns to face us to show its notch
        const h = sramp(t, tNotch - 0.8, tNotch + 0.6);
        const hero = discs[N - 1];
        hero.position.set(lerp(hero.position.x, 6.6, h), lerp(0, 0.2, h), lerp(0, 1.4, h));
        hero.rotation.set(0, lerp(Math.PI / 2, 0.15, h), 0);
        const cut = (t - shot.from) / 0.32;
        saw.position.set(end + 0.01, 0, 0);
        saw.rotation.y = Math.PI / 2;
        saw.material.opacity = t < shot.from + 0.2 + N * 0.32 ? 0.6 * (0.5 + 0.5 * Math.sin(cut * Math.PI * 2)) : 0;
        ingot.position.x = -0.0;
        const k = sramp(t, shot.from, shot.to);
        W.aim(cam, [lerp(1.2, 3.6, k), lerp(2.6, 1.4, k), lerp(8.5, 6.6, k)], [lerp(2.0, 5.0, k), 0, 0]);
      };
      W.label({ shot: "wafer-slice", text: "Each wafer", sub: "under 1 mm thick", color: C.ink, at: new THREE.Vector3(2.9, 1.0, 0), from: tDiscs + 0.6, to: tNotch - 0.5, dx: 120, dy: -120 });
      W.label({ shot: "wafer-slice", text: "Notch", sub: "marks the crystal direction", color: C.amber, at: () => discs[N - 1].localToWorld(new THREE.Vector3(0, -R, 0)), from: tNotch + 0.5, to: shot.to, dx: 170, dy: 40 });
    },
  });

  /* ======================= 10d. value ======================= */
  W.shot({
    id: "wafer-value",
    from: () => cue("wafer", "blank") - 0.15,
    to: () => slot("wafer").end,
    fadeIn: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 1.4, rim: 1.6 });
      const cam = W.newCamera(30);
      const wafer = W.makeWafer({ bare: true });
      s.add(wafer.group);
      const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 6.2), W.basic(C.amber, 0, true));
      s.add(sweep);
      const tFin = cue("wafer", "finished");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = sramp(t, tFin - 0.1, tFin + 0.9);
        const x = lerp(-3.2, 3.2, k);
        wafer.paint((d) => clamp((x - d.x) * 3, 0, 1), t * 0.3);
        sweep.position.set(x, 0.1, 0);
        sweep.material.opacity = 0.7 * Math.sin(Math.PI * k);
        wafer.group.rotation.y = lerp(0.3, -0.2, sramp(t, shot.from, shot.to));
        W.aim(cam, [0, lerp(6.2, 5.6, sramp(t, shot.from, shot.to)), lerp(6.0, 5.2, sramp(t, shot.from, shot.to))], [0, -0.4, 0]);
      };
      W.label({ shot: "wafer-value", text: "Blank wafer", sub: "≈ $100", color: C.ink, at: new THREE.Vector3(-2.2, 0.05, 1.4), from: cue("wafer", "costs") - 0.1, to: tFin, dx: -120, dy: -200 });
      W.label({ shot: "wafer-value", text: "Finished wafer", sub: "≈ $100,000", big: true, color: C.amber, at: new THREE.Vector3(2.0, 0.05, 1.2), from: cue("wafer", "worth") - 0.1, to: shot.to, dx: 150, dy: -200 });
    },
  });

  /* ======================= 11a. testing the dies ======================= */
  W.shot({
    id: "pkg-test",
    from: () => slot("package").start,
    to: () => cue("package", "each") - 0.15,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.5 });
      const cam = W.newCamera(30);
      const wafer = W.makeWafer();
      s.add(wafer.group);
      const r = W.rng(99);
      const res = wafer.dies.map(() => {
        const x = r();
        return x < 0.64 ? 0 : x < 0.9 ? 1 : 2; // 0 all good, 1 partly working, 2 dead
      });
      const resCol = [new THREE.Color(C.lime), new THREE.Color(C.amber), new THREE.Color(C.coral)];
      const probe = new THREE.Group();
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.5), W.mat.pcb);
      probe.add(card);
      const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 4), W.mat.gold, 40);
      for (let i = 0; i < 40; i++) {
        _m.makeTranslation(-0.2 + (i % 10) * 0.045, -0.12, -0.08 + Math.floor(i / 10) * 0.05);
        pins.setMatrixAt(i, _m);
      }
      probe.add(pins);
      s.add(probe);
      const n = wafer.dies.length;
      const tTest = cue("package", "tested") - 0.4;
      const tSort = cue("package", "sorted");
      const tTop = cue("package", "flawless");
      const tCheap = cue("package", "slightly");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = Math.pow(ramp(t, tTest, tSort - 0.2), 1.5);
        const cur = k * n;
        for (const d of wafer.dies) {
          const done = cur - d.order;
          let col;
          if (done < 0) col = _c.setRGB(0.55, 0.62, 0.7);
          else {
            const rr = res[d.order];
            // after "sorted", the top tier pulses on "flawless", the cheaper ones on "slightly"
            let b = 0.85;
            if (rr === 0) b += 0.6 * win(t, tTop, tTop + 1.6, 0.2, 0.6);
            if (rr === 1) b += 0.6 * win(t, tCheap, tCheap + 1.8, 0.2, 0.6);
            if (rr !== 0 && t > tTop - 0.1 && t < tTop + 1.6) b *= 0.45;
            if (rr !== 1 && t > tCheap - 0.1 && t < tCheap + 1.8) b *= 0.45;
            col = _c.copy(resCol[rr]).multiplyScalar(b);
          }
          wafer.inst.setColorAt(d.order, col);
        }
        wafer.inst.instanceColor.needsUpdate = true;
        const d = wafer.dies[Math.min(n - 1, Math.floor(cur))];
        const tap = 1 - Math.abs(Math.sin((cur % 1) * Math.PI));
        probe.position.set(d.x, 0.2 + 0.05 * (1 - tap), d.z);
        probe.visible = k > 0 && k < 1;
        const z = sramp(t, shot.from, shot.to);
        W.aim(cam, [lerp(2.4, 0.4, z), lerp(5.8, 7.6, z), lerp(5.6, 4.0, z)], [0, -0.3, lerp(-0.2, 0.2, z)]);
      };
      W.label({ shot: "pkg-test", text: "Every core works", sub: "top-tier processor", color: C.lime, at: new THREE.Vector3(-2.4, 0.05, 0.6), from: tTop + 0.1, to: shot.to, dx: -130, dy: -210 });
      W.label({ shot: "pkg-test", text: "A core or two off", sub: "sold as a cheaper model", color: C.amber, at: new THREE.Vector3(2.3, 0.05, 0.8), from: tCheap + 0.1, to: shot.to, dx: 130, dy: -210 });
    },
  });

  /* ======================= 11b. cut, flip, package ======================= */
  W.makePackage = function () {
    const g = new THREE.Group();
    const sub = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.12, 4.5), new THREE.MeshStandardMaterial({ color: 0x17382a, roughness: 0.42, metalness: 0.3 }));
    g.add(sub);
    const r = W.rng(11);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4 }), 60);
    for (let i = 0; i < 60; i++) {
      const side = i % 2 ? 1 : -1;
      _m.makeTranslation(side * (1.62 - r() * 0.12), 0.09, -1.9 + r() * 3.8);
      caps.setMatrixAt(i, _m);
    }
    g.add(caps);
    const lid = new THREE.Mesh(W.roundedBox(2.9, 3.4, 0.22, 0.25, 0.04), W.mat.steel);
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = 0.2;
    g.add(lid);
    return { group: g, lid, sub };
  };
  W.shot({
    id: "pkg-build",
    from: () => cue("package", "each") - 0.15,
    to: () => slot("package").end,
    fadeIn: 0.3,
    setup(shot) {
      const s = W.newScene({ key: 1.5, rim: 1.5 });
      const cam = W.newCamera(30);
      const P = W.makePackage();
      s.add(P.group);
      // a fragment of wafer with the die still in it
      const frag = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.08, 3.6), W.mat.siliconDark);
      frag.add(slab);
      const dieMat = new THREE.MeshStandardMaterial({ map: W.dieTex(), metalness: 0.5, roughness: 0.32 });
      for (const [x, z] of [
        [-2.45, -1.15],
        [2.45, -1.15],
        [-2.45, 1.15],
        [2.45, 1.15],
      ]) {
        const nb = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.06, 1.08), [W.mat.siliconDark, W.mat.siliconDark, dieMat, W.mat.siliconDark, W.mat.siliconDark, W.mat.siliconDark]);
        nb.position.set(x, 0.05, z);
        frag.add(nb);
      }
      frag.position.set(0, 2.2, 0);
      s.add(frag);
      const die = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.06, 1.08), [W.mat.siliconDark, W.mat.siliconDark, dieMat, new THREE.MeshStandardMaterial({ color: 0x7a6a50, metalness: 0.8, roughness: 0.4 }), W.mat.siliconDark, W.mat.siliconDark]);
      s.add(die);
      const laserPts = [
        [-1.21, -0.56],
        [1.21, -0.56],
        [1.21, 0.56],
        [-1.21, 0.56],
        [-1.21, -0.56],
      ].map(([x, z]) => new THREE.Vector3(x, 0.07, z));
      const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints(laserPts), new THREE.LineBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0 }));
      laser.position.copy(frag.position);
      s.add(laser);
      const laserDot = W.glow(0xff3b3b, 0.7, 0);
      s.add(laserDot);
      const tLaser = cue("package", "laser") - 0.3;
      const tFlip = cue("package", "flipped") - 0.2;
      const tCap = cue("package", "capped") - 0.1;
      const tNow = cue("package", "now");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // laser traces the die outline
        const lk = ramp(t, tLaser, tLaser + 1.0);
        laser.geometry.setDrawRange(0, Math.max(2, Math.ceil(lk * 5)));
        laser.material.opacity = win(t, tLaser, tFlip + 0.2, 0.1, 0.3);
        const seg = Math.min(3.999, lk * 4);
        const i0 = Math.floor(seg);
        const a = laserPts[i0],
          b = laserPts[i0 + 1];
        laserDot.position.set(lerp(a.x, b.x, seg - i0), frag.position.y + 0.1, lerp(a.z, b.z, seg - i0));
        laserDot.material.opacity = lk > 0 && lk < 1 ? 1 : 0;
        // the die lifts out, flips and lands on the substrate; the fragment drifts away
        const f = sramp(t, tFlip, tFlip + 1.4);
        die.position.set(0, lerp(2.25, 0.1, f) + Math.sin(f * Math.PI) * 1.2, 0);
        die.rotation.set(lerp(0, Math.PI, f), 0, 0);
        frag.position.y = 2.2 + sramp(t, tFlip, tFlip + 1.2) * 4;
        frag.visible = frag.position.y < 6;
        // lid comes down
        const c = sramp(t, tCap, tCap + 1.1);
        P.lid.position.y = lerp(3.6, 0.2, c);
        P.lid.visible = c > 0.001;
        const fin = sramp(t, tNow - 0.4, shot.to);
        P.group.rotation.y = lerp(0, 0.6, fin);
        die.rotation.y = 0;
        const k = sramp(t, shot.from, tCap);
        W.aim(cam, [lerp(2.2, 3.2, k) + fin * 1.2, lerp(6.2, 4.8, k) - fin * 0.6, lerp(5.2, 6.4, k) + fin * 1.0], [0, lerp(1.6, 0.4, k), 0]);
      };
      W.label({ shot: "pkg-build", text: "Laser", sub: "cuts each die free", color: 0xff5b5b, at: new THREE.Vector3(1.2, 2.3, 0.56), from: tLaser - 0.1, to: tFlip + 0.9, dx: 170, dy: -110 });
      W.label({ shot: "pkg-build", text: "Heat spreader", sub: "the metal lid", color: C.ink, at: () => new THREE.Vector3(1.3, P.lid.position.y + 0.1, 0), from: tCap + 0.6, to: tNow + 0.2, dx: 170, dy: -110 });
    },
  });

  /* ======================= 12. outro ======================= */
  W.shot({
    id: "out-stack",
    from: () => slot("outro").start,
    to: () => cue("outro", "all") - 0.15,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.6 });
      const cam = W.newCamera(30);
      const texes = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => W.layerTex(k));
      const mats = texes.map((tx) => new THREE.MeshLambertMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.18 }));
      const N = 80,
        th = 0.045;
      const hide = new THREE.MeshBasicMaterial({ visible: false });
      const full = mats.map((m) => [m, m, m, hide, m, m]);
      const sides = mats.map((m) => [m, m, hide, hide, m, m]);
      const slabs = [];
      for (let i = 0; i < N; i++) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(3.2, th, 3.2), full[i % 8]);
        sl.position.y = i * th + th / 2;
        sl.rotation.y = (i % 3) * (Math.PI / 2);
        sl.renderOrder = N - i; // top-down for early depth rejection
        s.add(sl);
        slabs.push(sl);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 3.2), W.mat.silicon);
      base.position.y = -0.25;
      s.add(base);
      const tE = cue("outro", "eighty");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // the layers separate into an exploded view as they are counted
        const ex = sramp(t, tE - 0.2, shot.to);
        slabs.forEach((sl, i) => {
          sl.position.y = i * th * (1 + ex * 2.2) + th / 2;
          sl.material = ex > 0.001 || i === N - 1 ? full[i % 8] : sides[i % 8];
        });
        mats.forEach((m) => (m.emissiveIntensity = 0.18 + 0.14 * ex));
        const yaw = lerp(0.2, 1.2, sramp(t, shot.from, shot.to));
        W.aim(cam, [Math.sin(yaw) * 11, lerp(5.6, 7.2, ex), Math.cos(yaw) * 11], [0, lerp(1.6, 4.0, ex), 0]);
      };
    },
  });

  W.shot({
    id: "out-die",
    from: () => cue("outro", "all") - 0.15,
    to: () => cue("outro", "few") - 0.15,
    fadeIn: 0.3,
    fadeOut: 0.3,
    setup(shot) {
      const s = W.newScene({ key: 1.2, rim: 1.4 });
      const cam = W.newCamera(30);
      const P = W.makePackage();
      P.lid.visible = false;
      s.add(P.group);
      const tex = W.dieTex();
      const dieMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.5, roughness: 0.3, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
      const die = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.05, 1.08), [W.mat.siliconDark, W.mat.siliconDark, dieMat, W.mat.siliconDark, W.mat.siliconDark, W.mat.siliconDark]);
      die.position.y = 0.085;
      s.add(die);
      const gl = W.glow(C.amber, 6, 0);
      gl.position.y = 0.3;
      s.add(gl);
      const t26 = cue("outro", "twenty-six");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = oramp(t, t26, t26 + 1.2);
        dieMat.emissiveIntensity = 0.55 * k;
        gl.material.opacity = 0.35 * k;
        const z = sramp(t, shot.from, shot.to);
        W.aim(cam, [lerp(0.4, 1.6, z), lerp(2.2, 4.4, z), lerp(2.2, 4.2, z)], [0, 0, 0]);
      };
      W.label({ shot: "out-die", text: "Switches", sub: "26 billion", big: true, color: C.amber, at: new THREE.Vector3(0.9, 0.12, 0.4), from: t26 + 0.2, to: shot.to, dx: 200, dy: -160 });
    },
  });

  W.shot({
    id: "out-phone",
    from: () => cue("outro", "few") - 0.15,
    to: () => window.VO.duration,
    fadeIn: 0.3,
    fadeOut: 1.4,
    setup(shot) {
      const s = W.newScene({ key: 1.2, rim: 1.4 });
      const cam = W.newCamera(32);
      const P = W.makePhone();
      s.add(P.group);
      const halo = W.glow(0x3a7bd5, 40, 0.18);
      halo.position.set(0, 0, -6);
      s.add(halo);
      const tDoz = cue("outro", "dozens");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        P.light(t, tDoz - 0.8, 1.6, tDoz);
        const k = sramp(t, shot.from, shot.to);
        P.group.rotation.set(lerp(-0.2, -0.32, k), lerp(0.25, 0.55, k), 0.02);
        W.aim(cam, [lerp(0.4, -1.2, k), lerp(3.6, 2.0, k), lerp(14, 30, k)], [0.3, lerp(2.8, 0.6, k), 0]);
      };
    },
  });
})();
