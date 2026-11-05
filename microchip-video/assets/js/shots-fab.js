/* Chapters 6–7: the fab floor, the wafer pod and its overhead rail, the lithography scanner. */
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

  /* ======================= the fab floor (shared by two shots) ======================= */
  let FAB = null;
  function fab() {
    if (FAB) return FAB;
    const s = W.newScene({ bg: 0x070a0e, fog: [30, 120], key: 1.5, rim: 0.9, amb: 0.25 });
    const r = W.rng(435);
    const floorTex = W.canvasTex(
      128,
      128,
      (g, w, h) => {
        g.fillStyle = "#2a3038";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#1c2128";
        for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) g.fillRect(x - 2, y - 2, 4, 4);
        g.strokeStyle = "#151a20";
        g.lineWidth = 3;
        g.strokeRect(0, 0, w, h);
      },
      { repeat: [80, 60] }
    );
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    // 435 tools in bays. Each bay is one family; the lithography bay is lit amber.
    const famCols = [C.teal, C.coral, C.violet, C.sky, C.lime, C.teal, C.coral, C.teal, C.sky, C.coral, C.lime];
    const rows = [];
    for (let z = -33; z <= 33; z += 6.6) rows.push(z);
    const tools = [];
    const LITHO_ROW = 5;
    rows.forEach((z, ri) => {
      const litho = ri === LITHO_ROW;
      for (const side of [-1, 1]) {
        let x = -52;
        while (x < 52 && tools.length < 435) {
          const w = litho ? 4.2 : 1.6 + r() * 1.1;
          const h = litho ? 2.9 : 1.5 + r() * 1.2;
          const d = litho ? 2.6 : 1.5 + r() * 0.7;
          tools.push({ x: x + w / 2, z: z + side * (1.3 + d / 2), w, h, d, side, litho, col: litho ? C.amber : famCols[ri % famCols.length] });
          x += w + 0.35 + (litho ? 1.2 : 0);
        }
      }
    });
    while (tools.length > 435) tools.pop();
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.1 }), tools.length);
    const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), tools.length);
    const port = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), W.mat.dark, tools.length);
    tools.forEach((t, k) => {
      _m.compose(_p.set(t.x, t.h / 2, t.z), _q.identity(), _s.set(t.w, t.h, t.d));
      body.setMatrixAt(k, _m);
      body.setColorAt(k, _c.setHex(t.litho ? 0xf2d9a8 : 0xd9dde2));
      _m.compose(_p.set(t.x, t.h * 0.88, t.z), _q.identity(), _s.set(t.w * 1.003, 0.07, t.d * 1.003));
      strip.setMatrixAt(k, _m);
      strip.setColorAt(k, _c.setHex(t.col));
      _m.compose(_p.set(t.x, t.h * 0.42, t.z - t.side * (t.d / 2 + 0.22)), _q.identity(), _s.set(Math.min(1.0, t.w * 0.55), 0.08, 0.44));
      port.setMatrixAt(k, _m);
    });
    s.add(body, strip, port);
    // amber light over the lithography bay
    const lz = rows[LITHO_ROW];
    for (let x = -48; x <= 48; x += 12) {
      const gl = W.glow(C.amber, 16, 0.22);
      gl.position.set(x, 6, lz);
      s.add(gl);
    }
    const amberLight = new THREE.PointLight(C.amber, 60, 40, 1.6);
    amberLight.position.set(0, 7, lz);
    s.add(amberLight);
    // overhead rails above each aisle
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3a424c, metalness: 0.6, roughness: 0.5 });
    for (const z of rows) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(108, 0.1, 0.16), railMat);
      rail.position.set(0, 6.4, z);
      s.add(rail);
    }
    // ceiling light strips (emissive bars, high above the rails)
    // overhead transport vehicles carrying pods
    const vehicles = [];
    const vehBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), W.mat.white, rows.length * 4);
    const vehPod = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.48, 0.5), new THREE.MeshStandardMaterial({ color: 0xbfc8d2, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 }), rows.length * 4);
    rows.forEach((z, ri) => {
      for (let k = 0; k < 4; k++) vehicles.push({ z, off: r() * 108, v: (r() < 0.5 ? -1 : 1) * (2.5 + r() * 2.5) });
    });
    s.add(vehBody, vehPod);
    // hero vehicle and pod for the delivery shot
    const hero = new THREE.Group();
    const hv = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), W.mat.white);
    hero.add(hv);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1, 0.02), W.basic(0x222222));
    hero.add(cable);
    const heroPod = W.makePod(0.62);
    hero.add(heroPod);
    s.add(hero);
    const heroGlow = W.glow(0xffffff, 2.2, 0.4);
    heroPod.add(heroGlow);
    FAB = { s, tools, rows, vehicles, vehBody, vehPod, hero, cable, heroPod, lz, LITHO_ROW };
    FAB.update = (t) => {
      vehicles.forEach((v, k) => {
        const x = ((((v.off + v.v * t) % 108) + 108) % 108) - 54;
        _m.makeTranslation(x, 6.1, v.z);
        vehBody.setMatrixAt(k, _m);
        _m.makeTranslation(x, 5.62, v.z);
        vehPod.setMatrixAt(k, _m);
      });
      vehBody.instanceMatrix.needsUpdate = true;
      vehPod.instanceMatrix.needsUpdate = true;
    };
    return FAB;
  }

  // a front-opening wafer pod: translucent shell, 25 wafers, handle
  W.makePod = function (scale = 1) {
    const g = new THREE.Group();
    const shellGeo = W.roundedBox(1, 1, 1, 0.12, 0.03);
    const shell = new THREE.Mesh(shellGeo, new THREE.MeshPhysicalMaterial({ color: 0xd8e2ec, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false }));
    g.add(shell);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    g.add(edges);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), W.mat.white);
    handle.position.y = 0.55;
    g.add(handle);
    const waferMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b5, metalness: 0.85, roughness: 0.22 });
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.008, 64);
    for (let i = 0; i < 25; i++) {
      const wf = new THREE.Mesh(wg, waferMat);
      wf.position.y = -0.42 + i * 0.034;
      g.add(wf);
    }
    g.scale.setScalar(scale);
    return g;
  };

  W.shot({
    id: "fab-a",
    from: () => slot("fab").start,
    to: () => cue("fab", "wafers") - 0.15,
    setup(shot) {
      const F = fab();
      const cam = W.newCamera(38);
      const tSome = cue("fab", "some");
      const scanner = F.tools.find((t) => t.litho && t.x > 4);
      shot.scene = F.s;
      shot.camera = cam;
      shot.update = (t) => {
        F.update(t);
        F.hero.visible = false;
        // forward glide high over the floor, then descend toward a lithography scanner
        const k = sramp(t, shot.from, tSome);
        const d = sramp(t, tSome - 0.4, shot.to);
        const pos = [lerp(-46, -14, k), lerp(24, 17, k), lerp(34, 24, k)];
        const look = [lerp(-14, 8, k), 0, lerp(2, -6, k)];
        const pos2 = [scanner.x - 6.5, 5.2, F.lz + 9.5];
        const look2 = [scanner.x, 1.6, F.lz];
        W.aim(cam, pos.map((v, i) => lerp(v, pos2[i], d)), look.map((v, i) => lerp(v, look2[i], d)));
      };
      W.label({ shot: "fab-a", text: "Clean room", sub: "≈ 8 football fields", color: C.ink, at: new THREE.Vector3(-20, 3, 0), from: cue("fab", "eight") - 0.2, to: tSome - 0.2, dx: -120, dy: -150 });
      W.label({ shot: "fab-a", text: "Lithography scanner", sub: "up to $170 million", color: C.amber, at: new THREE.Vector3(scanner.x, scanner.h + 0.1, scanner.z), from: cue("fab", "hundred") + 0.3, to: shot.to, dx: 140, dy: -160 });
    },
  });

  W.shot({
    id: "fab-pod",
    from: () => cue("fab", "wafers") - 0.15,
    to: () => cue("fab", "carried") - 0.1,
    fadeIn: 0.25,
    fadeOut: 0.2,
    setup(shot) {
      const s = W.newScene({ key: 1.6, rim: 1.6, amb: 0.12 });
      const cam = W.newCamera(30);
      const pod = W.makePod(2.4);
      s.add(pod);
      const wafer = W.makeWafer();
      wafer.group.scale.setScalar(0.33);
      s.add(wafer.group);
      const t300 = cue("fab", "three");
      const t25 = cue("fab", "twenty-five");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // one wafer slides out of the pod, then returns as the pod is named
        const out = sramp(t, shot.from + 0.1, t300 + 0.5) * (1 - sramp(t, t25 - 0.6, t25 + 0.2));
        wafer.group.position.set(0, -0.42 * 2.4 + 12 * 0.034 * 2.4, lerp(0, 3.2, out));
        wafer.group.rotation.y = 0.0;
        wafer.paint(() => 1, t * 0.3);
        pod.rotation.y = lerp(-0.7, -0.35, sramp(t, shot.from, shot.to));
        wafer.group.rotation.y = pod.rotation.y;
        wafer.group.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), pod.rotation.y);
        W.aim(cam, [lerp(1.5, 0.5, sramp(t, shot.from, shot.to)), lerp(3.6, 2.6, sramp(t, shot.from, shot.to)), lerp(9.5, 8.4, sramp(t, shot.from, shot.to))], [0, -0.1, 1.0]);
      };
      W.label({ shot: "fab-pod", text: "Wafer", sub: "300 mm across", color: C.ink, at: () => wafer.group.position.clone().add(new THREE.Vector3(0.9, 0.05, 0.2)), from: t300 - 0.1, to: t25 - 0.5, dx: 170, dy: -90 });
      W.label({ shot: "fab-pod", text: "Sealed pod", sub: "25 wafers", color: C.sky, at: new THREE.Vector3(-1.2, 1.2, 0), from: t25, to: shot.to, dx: -150, dy: -110 });
    },
  });

  W.shot({
    id: "fab-b",
    from: () => cue("fab", "carried") - 0.1,
    to: () => slot("fab").end,
    fadeIn: 0.25,
    setup(shot) {
      const F = fab();
      const cam = W.newCamera(38);
      const tWith = cue("fab", "with", 2) - 0.2;
      const row = F.rows[3];
      const target = F.tools.find((t) => !t.litho && Math.abs(t.z - (row + 1.3 + t.d / 2)) < 0.01 && t.x > 6);
      const tx = target.x,
        tz = row;
      const tA = shot.from,
        tStop = tWith - 0.9;
      shot.scene = F.s;
      shot.camera = cam;
      shot.update = (t) => {
        F.update(t);
        F.hero.visible = true;
        // the hero vehicle runs down the rail, stops above the tool and lowers the pod onto its port
        const k = easeOut(ramp(t, tA, tStop));
        const x = lerp(tx - 22, tx, k);
        const drop = sramp(t, tStop, tStop + 1.4);
        const portY = target.h * 0.42 + 0.04 + 0.31;
        const podY = lerp(5.62, portY, drop);
        F.hero.position.set(x, 6.1, tz);
        F.heroPod.position.set(0, podY - 6.1, 0.0);
        const portZ = target.z - target.side * (target.d / 2 + 0.22);
        F.heroPod.position.z = lerp(0, portZ - tz, drop);
        F.cable.scale.y = Math.max(0.01, 6.1 - podY - 0.3);
        F.cable.position.set(0, -(6.1 - podY) / 2, F.heroPod.position.z / 2);
        F.heroPod.children[F.heroPod.children.length - 1].material.opacity = 0.35;
        // camera rides alongside, then rises to the wide shot for the numbers
        const up = sramp(t, tWith - 0.2, shot.to);
        const pos = [x - 3.2, lerp(7.4, 5.6, drop), tz + 4.2];
        const look = [x + 0.4, lerp(5.9, portY + 0.8, drop), tz];
        const pos2 = [-38, 36, 52];
        const look2 = [4, 0, -4];
        W.aim(cam, pos.map((v, i) => lerp(v, pos2[i], up)), look.map((v, i) => lerp(v, look2[i], up)));
      };
      W.label({ shot: "fab-b", text: "Overhead rail", sub: "tool to tool", color: C.ink, at: () => F.hero.position.clone().add(new THREE.Vector3(0, 0.3, 0)), from: shot.from + 0.4, to: tWith - 0.4, dx: 120, dy: -130 });
    },
  });

  /* ======================= 7. lithography ======================= */
  W.reticleTex = () =>
    W.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#dfe9f2";
      g.fillRect(0, 0, w, h);
      // two copies of one layer of the chip, as on the real 6-inch mask
      const r = W.rng(5);
      for (const y0 of [40, 270]) {
        g.fillStyle = "#14181d";
        g.fillRect(40, y0, 432, 200);
        g.fillStyle = "#dfe9f2";
        for (let i = 0; i < 380; i++) {
          const x = 46 + r() * 410,
            y = y0 + 6 + r() * 180;
          if (r() < 0.5) g.fillRect(x, y, 6 + r() * 40, 3);
          else g.fillRect(x, y, 3, 6 + r() * 30);
        }
      }
    });
  W.shot({
    id: "litho-scan",
    from: () => slot("litho").start,
    to: () => cue("litho", "steps") - 0.6,
    setup(shot) {
      const s = W.newScene({ key: 1.6, rim: 1.6, amb: 0.16 });
      const cam = W.newCamera(32);
      const g = new THREE.Group();
      s.add(g);
      const src = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 2.6), W.mat.dark);
      src.position.y = 10.4;
      g.add(src);
      const srcGlow = W.glow(C.uv, 5, 0);
      srcGlow.position.y = 9.9;
      g.add(srcGlow);
      const reticle = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 3.0), [W.mat.steel, W.mat.steel, new THREE.MeshStandardMaterial({ map: W.reticleTex(), roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.92 }), W.mat.steel, W.mat.steel, W.mat.steel]);
      reticle.position.y = 8.2;
      g.add(reticle);
      // projection lens: half-cut housing with elements inside
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 5.2, 64, 1, true, Math.PI * 0.5, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }));
      housing.position.y = 4.6;
      g.add(housing);
      const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xcfeaff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false });
      [1.6, 1.4, 1.2, 1.05, 0.95, 0.8].forEach((rr, i) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(rr, 48, 16), lensMat);
        l.scale.y = 0.18;
        l.position.y = 6.6 - i * 0.8;
        g.add(l);
      });
      // beam: wide at the mask, four times narrower at the wafer
      const beam1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 48, 1, true), W.basic(C.uv, 0, true));
      beam1.position.y = 9.1;
      const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.3, 6.6, 48, 1, true), W.basic(C.uv, 0, true));
      beam2.position.y = 4.85;
      g.add(beam1, beam2);
      const wafer = W.makeWafer({ bare: true });
      wafer.group.scale.setScalar(0.65);
      wafer.group.position.y = 1.2;
      g.add(wafer.group);
      const stage = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 5.2), W.mat.dark);
      stage.position.y = 0.85;
      g.add(stage);
      const spot = W.glow(C.uv, 1.0, 0);
      spot.position.y = 1.3;
      g.add(spot);
      const tUV = cue("litho", "ultraviolet");
      const tLens = cue("litho", "lenses");
      const t4 = cue("litho", "four");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const on = oramp(t, tUV, tUV + 0.6);
        srcGlow.material.opacity = on;
        beam1.material.opacity = 0.22 * on;
        beam2.material.opacity = 0.22 * oramp(t, tLens - 0.2, tLens + 0.6);
        spot.material.opacity = oramp(t, tLens, tLens + 0.8);
        g.rotation.y = lerp(0.6, 0.15, sramp(t, shot.from, shot.to));
        const down = sramp(t, tLens - 0.5, shot.to);
        W.aim(cam, [0, lerp(14.5, 9.0, down), lerp(13.5, 17.5, down)], [0, lerp(7.4, 4.8, down), 0]);
      };
      W.label({ shot: "litho-scan", text: "Photomask", sub: "the stencil", color: C.amber, at: new THREE.Vector3(-1.5, 8.25, 1.5), from: cue("litho", "photomask") - 0.1, to: shot.to, dx: -170, dy: -40 });
      W.label({ shot: "litho-scan", text: "Lenses shrink it", sub: "4×", big: true, color: C.uv, at: new THREE.Vector3(1.9, 4.6, 0), from: t4 - 0.2, to: shot.to, dx: 220, dy: -20 });
      W.label({ shot: "litho-scan", text: "Wafer", sub: "", color: C.ink, at: new THREE.Vector3(-1.9, 1.25, 0.6), from: tLens + 0.6, to: shot.to, dx: -170, dy: 40 });
    },
  });

  W.shot({
    id: "litho-step",
    from: () => cue("litho", "steps") - 0.6,
    to: () => cue("litho", "single") - 0.25,
    fadeIn: 0.25,
    fadeOut: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.5 });
      const cam = W.newCamera(30);
      const wafer = W.makeWafer({ bare: true });
      s.add(wafer.group);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(wafer.dw, 6, wafer.dh), W.basic(C.uv, 0.0, true));
      s.add(beam);
      const flash = W.glow(C.uv, 1.4, 0);
      s.add(flash);
      const t0 = cue("litho", "steps");
      const t1 = cueEnd("litho", "pattern") + 0.2;
      const n = wafer.dies.length;
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const k = ramp(t, t0, t1);
        // exposures accelerate: a few slow ones first, then the rest of the wafer
        const kk = Math.pow(k, 1.8);
        const cur = kk * n;
        wafer.paint((d) => clamp(cur - d.order, 0, 1), 0.6 + t * 0.15);
        const d = wafer.dies[Math.min(n - 1, Math.floor(cur))];
        const vis = k > 0 && k < 1 ? 1 : 0;
        beam.position.set(d.x, 3.03, d.z);
        beam.material.opacity = 0.18 * vis;
        flash.position.set(d.x, 0.1, d.z);
        flash.material.opacity = vis * (0.4 + 0.6 * (1 - (cur % 1)));
        const z = sramp(t, shot.from, shot.to);
        W.aim(cam, [lerp(1.6, 0.4, z), lerp(7.6, 8.4, z), lerp(6.2, 5.0, z)], [0, -0.4, lerp(-0.2, 0.2, z)]);
      };
    },
  });

  W.shot({
    id: "litho-masks",
    from: () => cue("litho", "single") - 0.25,
    to: () => slot("litho").end,
    fadeIn: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 1.4, rim: 1.6, amb: 0.12 });
      const cam = W.newCamera(32);
      const tex = W.reticleTex();
      const N = 80;
      const geo = new THREE.BoxGeometry(1.5, 0.03, 1.5);
      const masks = [];
      for (let i = 0; i < N; i++) {
        const mat = new THREE.MeshPhysicalMaterial({ map: tex, color: new THREE.Color().setHSL(0.58 + 0.08 * Math.sin(i * 0.7), 0.25, 0.75), roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 });
        const m = new THREE.Mesh(geo, mat);
        s.add(m);
        masks.push(m);
      }
      const tEighty = cue("litho", "eighty");
      const tCost = cue("litho", "costing");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        for (let i = 0; i < N; i++) {
          // a spiral of masks dealt out one by one
          const ti = tEighty - 0.2 + (i / N) * 1.8;
          const k = oramp(t, ti, ti + 0.5);
          const a = i * 0.29;
          const rr = 2.2 + i * 0.045;
          masks[i].position.set(Math.cos(a) * rr * k, i * 0.05 * k - 0.5 + (1 - k) * 3, Math.sin(a) * rr * k);
          masks[i].rotation.set(0.2 * Math.sin(a), -a, 0.12);
          masks[i].visible = k > 0.001;
        }
        const yaw = lerp(0.3, 0.8, sramp(t, shot.from, shot.to));
        W.aim(cam, [Math.sin(yaw) * 11, lerp(7, 8.5, sramp(t, shot.from, shot.to)), Math.cos(yaw) * 11], [0, 1.2, 0]);
      };
      W.label({ shot: "litho-masks", text: "Masks for one chip", sub: "80", big: true, color: C.amber, at: new THREE.Vector3(-3.6, 2.5, 0), from: tEighty + 0.6, to: shot.to, dx: -150, dy: -110 });
      W.label({ shot: "litho-masks", text: "Each one", sub: "≈ $300,000", color: C.ink, at: new THREE.Vector3(3.4, 3.0, 0.5), from: tCost + 0.2, to: shot.to, dx: 150, dy: -60 });
    },
  });
})();
