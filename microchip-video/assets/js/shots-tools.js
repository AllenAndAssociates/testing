/* Chapters 8–9: deposition, etch, polishing, ion implant + anneal; cleaning and inspection. */
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
    _c = new THREE.Color();

  // falling or flying particles as one instanced mesh; pos(i, t) -> [x,y,z,visible]
  function swarm(n, size, color, emissive = 0) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.4, metalness: 0.3 });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 10, 6), mat, n);
    mesh.frustumCulled = false;
    mesh.place = (fn) => {
      for (let i = 0; i < n; i++) {
        const [x, y, z, v] = fn(i);
        _m.compose(_p.set(x, y, z), _q.identity(), _s.setScalar(v ? 1 : 0.0001));
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    return mesh;
  }

  /* ======================= 8a. deposition + etch + CMP on the cross-section ======================= */
  W.shot({
    id: "tools-section",
    from: () => slot("tools").start,
    to: () => cue("tools", "and", 2) - 0.2,
    setup(shot) {
      const s = W.newScene({ key: 1.4, rim: 1.4, amb: 0.14 });
      const cam = W.newCamera(30);
      const sec = W.makeSection();
      s.add(sec.group);
      const st = W.sectionState();
      const tDep = shot.from + 0.3;
      const tPlasma = cue("tools", "plasma");
      const tChem = cue("tools", "chemical");
      const tEnd = shot.to;
      // deposition rain
      const N = 420;
      const rain = swarm(N, 0.07, C.teal, 0.6);
      s.add(rain);
      const ions = swarm(260, 0.045, 0xff6fb5, 1.2);
      s.add(ions);
      const r = W.rng(88);
      const seeds = Array.from({ length: N }, () => [r() * 12 - 6, r() * 4 - 2, r()]);
      const iseeds = Array.from({ length: 260 }, () => [r(), r() * 4 - 2, r()]);
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // deposition: a film builds up from atoms raining down
        Object.assign(st, W.sectionState());
        st.oxide = sramp(t, tDep, tPlasma - 1.6);
        // etch: resist mask on top, plasma carves the openings
        st.resist = t > tPlasma - 1.2 ? 1 : 0;
        st.spread = 1;
        st.develop = 1;
        st.exposed = 1;
        st.plasma = win(t, tPlasma - 0.4, tChem - 0.3, 0.3, 0.4);
        st.etch = sramp(t, tPlasma + 0.3, tChem - 0.5);
        // CMP: copper already filled, pad grinds it flat
        if (t >= tChem - 0.35) {
          st.resist = 0;
          st.etch = 1;
          st.fill = 1;
          st.padX = ramp(t, tChem + 0.2, tEnd - 0.2);
          st.pad = st.padX > 0 && st.padX < 1 ? 1 : 0;
          st.padSpin = t * 4;
          st.polish = sramp(t, tChem + 0.9, tEnd - 0.8);
        }
        sec.set(st);
        const rainOn = t < tPlasma - 1.3;
        rain.place((i) => {
          const [x, z, ph] = seeds[i];
          const cyc = 0.9;
          const u = ((t * 1.3 + ph * cyc) % cyc) / cyc;
          const y = lerp(6, sec.OX * st.oxide + 0.05, u);
          return [x, y, z, rainOn && t > tDep - 0.2];
        });
        const ionOn = st.plasma > 0.2;
        ions.place((i) => {
          const [a, z, ph] = iseeds[i];
          const tr = sec.trenches[Math.floor(a * sec.trenches.length) % sec.trenches.length];
          const x = tr[0] + (ph - 0.5) * tr[1] * 0.8;
          const u = (t * 2.2 + ph * 3.1) % 1;
          return [x, lerp(4.0, sec.OX * (1 - st.etch) + 0.05, u), z, ionOn];
        });
        const yaw = lerp(0.6, 0.4, sramp(t, shot.from, shot.to));
        W.aim(cam, [Math.sin(yaw) * 20, 6.8, Math.cos(yaw) * 20], [0, 0.8, 0]);
      };
      const L = (text, sub, color, at, from, to, dx, dy) => W.label({ shot: "tools-section", text, sub, color, at, from, to, dx, dy });
      L("Deposition", "adds material", C.teal, new THREE.Vector3(-5.5, 1.0, 2), tDep + 0.6, tPlasma - 0.6, -150, -150);
      L("Plasma etch", "carves straight down", C.coral, new THREE.Vector3(0.2, 0.6, 2), tPlasma + 0.3, tChem - 0.5, 200, -170);
      L("Chemical mechanical polishing", "grinds it flat", C.coral, new THREE.Vector3(-4.5, 1.3, 2), tChem + 0.4, tEnd, -120, -170);
    },
  });

  /* ======================= 8b. ion implant + anneal on a silicon lattice ======================= */
  W.shot({
    id: "tools-implant",
    from: () => cue("tools", "and", 2) - 0.2,
    to: () => slot("tools").end,
    fadeIn: 0.3,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.6, amb: 0.12 });
      const cam = W.newCamera(32);
      const nx = 12,
        ny = 7,
        nz = 8,
        a = 0.7;
      const N = nx * ny * nz;
      const r = W.rng(1000);
      const atoms = [];
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++)
          for (let k = 0; k < nz; k++) atoms.push({ x: (i - (nx - 1) / 2) * a, y: -j * a, z: (k - (nz - 1) / 2) * a, jx: r() - 0.5, jy: r() - 0.5, jz: r() - 0.5, hit: 0 });
      const siMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 16, 10), new THREE.MeshStandardMaterial({ color: 0x9fb2c4, metalness: 0.5, roughness: 0.35 }), N);
      s.add(siMesh);
      // bonds as thin lines
      const bondPts = [];
      for (const p of atoms) {
        if (p.x < ((nx - 1) / 2) * a - 0.01) bondPts.push(p.x, p.y, p.z, p.x + a, p.y, p.z);
        if (p.y > -(ny - 1) * a + 0.01) bondPts.push(p.x, p.y, p.z, p.x, p.y - a, p.z);
        if (p.z < ((nz - 1) / 2) * a - 0.01) bondPts.push(p.x, p.y, p.z, p.x, p.y, p.z + a);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.Float32BufferAttribute(bondPts, 3));
      const bonds = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0x4c6a85, transparent: true, opacity: 0.5 }));
      s.add(bonds);
      // dopants: each lands on a lattice site, deep in the crystal
      const ND = 14;
      const dop = [];
      for (let d = 0; d < ND; d++) {
        const i = 1 + Math.floor(r() * (nx - 2)),
          k = 1 + Math.floor(r() * (nz - 2)),
          j = 2 + Math.floor(r() * (ny - 3));
        dop.push({ x: (i - (nx - 1) / 2) * a, y: -j * a, z: (k - (nz - 1) / 2) * a, boron: d % 2 === 0 });
      }
      const dopMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), ND);
      dop.forEach((d, k) => dopMesh.setColorAt(k, _c.setHex(d.boron ? C.violet : C.amber)));
      s.add(dopMesh);
      const dopGlow = dop.map((d) => {
        const gl = W.glow(d.boron ? C.violet : C.amber, 1.3, 0);
        s.add(gl);
        return gl;
      });
      const trails = dop.map((d) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), W.basic(d.boron ? C.violet : C.amber, 0, true));
        s.add(m);
        return m;
      });
      const heat = W.glow(0xff7a2e, 22, 0);
      heat.position.set(0, -2, -2);
      s.add(heat);
      const tIon = cue("tools", "ion");
      const tFire = cue("tools", "fire");
      const tOne = cue("tools", "one");
      const tQuick = cue("tools", "quick");
      const tHeal = cue("tools", "heals");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const damage = (k) => k; // displacement around impacts
        const anneal = sramp(t, tQuick + 0.3, tHeal + 0.6);
        // impacts: each dopant has its own time between "fire" and "quick"
        dop.forEach((d, k) => {
          const ti = tFire + (k / ND) * (tQuick - tFire - 0.6);
          const u = ramp(t, ti, ti + 0.35);
          const y = lerp(6, d.y, easeIn(u));
          const settle = sramp(t, tQuick, tHeal + 0.6);
          _m.compose(_p.set(d.x + 0.25 * (1 - settle) * (u >= 1 ? 1 : 0), y, d.z), _q.identity(), _s.setScalar(u > 0 ? 1 : 0.0001));
          dopMesh.setMatrixAt(k, _m);
          dopGlow[k].position.set(d.x, y, d.z);
          dopGlow[k].material.opacity = u > 0 ? 0.8 : 0;
          const tr = trails[k];
          const len = Math.max(0.01, 6 - y);
          tr.scale.y = len;
          tr.position.set(d.x, y + len / 2, d.z);
          tr.material.opacity = u > 0 && u < 1 ? 0.8 : u >= 1 ? 0.8 * Math.exp(-(t - ti - 0.35) * 4) : 0;
          d.t = ti;
        });
        dopMesh.instanceMatrix.needsUpdate = true;
        atoms.forEach((p, i) => {
          let disp = 0;
          for (const d of dop) {
            if (t < d.t + 0.3) continue;
            const dist = Math.hypot(p.x - d.x, p.y - d.y, p.z - d.z);
            disp += Math.exp(-dist * 1.6) * 0.9;
          }
          disp = Math.min(0.45, disp) * (1 - anneal);
          _m.makeTranslation(p.x + p.jx * disp, p.y + p.jy * disp, p.z + p.jz * disp);
          siMesh.setMatrixAt(i, _m);
        });
        siMesh.instanceMatrix.needsUpdate = true;
        heat.material.opacity = 0.55 * win(t, tQuick, shot.to + 1, 0.4, 0.4);
        const yaw = lerp(0.75, 0.35, sramp(t, shot.from, shot.to));
        W.aim(cam, [Math.sin(yaw) * 13, lerp(5.5, 3.5, sramp(t, shot.from, shot.to)), Math.cos(yaw) * 13], [0, -2.2, 0]);
      };
      W.label({ shot: "tools-implant", text: "Ion implant", sub: "boron or phosphorus", color: C.violet, at: new THREE.Vector3(-3.8, 0.2, 2.4), from: tIon + 0.2, to: tQuick - 0.2, dx: -140, dy: -150 });
      W.label({ shot: "tools-implant", text: "About 1 atom in", sub: "10,000", big: true, color: C.amber, at: new THREE.Vector3(dop[1].x, dop[1].y, dop[1].z), from: tOne + 0.3, to: tQuick - 0.2, dx: 240, dy: -120 });
      W.label({ shot: "tools-implant", text: "Anneal", sub: "heat heals the crystal", color: 0xff8a3d, at: new THREE.Vector3(3.6, -1.5, 2.4), from: tQuick + 0.5, to: shot.to, dx: 140, dy: -170 });
    },
  });

  /* ======================= 9a. cleaning ======================= */
  W.shot({
    id: "clean",
    from: () => slot("inspect").start,
    to: () => cue("inspect", "electron") - 0.15,
    setup(shot) {
      const s = W.newScene({ key: 1.3, rim: 1.6 });
      const cam = W.newCamera(30);
      const wafer = W.makeWafer();
      s.add(wafer.group);
      const chuck = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.8, 48), W.mat.dark);
      chuck.position.y = -0.45;
      s.add(chuck);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 0.18), W.mat.steel);
      s.add(arm);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.4, 16), W.mat.steel);
      s.add(nozzle);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1, 12), W.basic(C.sky, 0, true));
      s.add(stream);
      const N = 360;
      const drops = swarm(N, 0.035, C.sky, 1.0);
      s.add(drops);
      const r = W.rng(42);
      const seeds = Array.from({ length: N }, () => [r() * Math.PI * 2, r(), r()]);
      const tRinse = cue("inspect", "rinsed");
      const tN2 = cue("inspect", "nitrogen");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        const spin = t * 6;
        wafer.group.rotation.y = spin;
        wafer.paint(() => 1, spin * 0.2);
        const sweep = Math.sin((t - shot.from) * 1.8) * 1.6;
        const wet = win(t, tRinse - 0.4, tN2 + 0.1, 0.3, 0.3);
        arm.position.set(sweep + 2.4, 1.6, 0);
        nozzle.position.set(sweep + 0.4, 1.45, 0);
        stream.scale.y = 1.25;
        stream.position.set(sweep + 0.4, 0.68, 0);
        stream.material.opacity = 0.7 * wet;
        drops.place((i) => {
          const [a0, ph, sp] = seeds[i];
          const u = (t * (0.8 + sp) + ph) % 1;
          const rr = lerp(0.2, 4.5, u);
          const a = a0 + u * 1.2;
          return [Math.cos(a) * rr, 0.06 + Math.sin(u * Math.PI) * 0.35, Math.sin(a) * rr, wet > 0.3 && rr < 4.4];
        });
        const yaw = lerp(0.5, 0.2, sramp(t, shot.from, shot.to));
        W.aim(cam, [Math.sin(yaw) * 8, 4.6, Math.cos(yaw) * 8], [0, 0, 0]);
      };
      W.label({ shot: "clean", text: "Ultra-pure water", sub: "rinse", color: C.sky, at: new THREE.Vector3(0.4, 1.0, 0), from: tRinse + 0.2, to: tN2 - 0.2, dx: 170, dy: -150 });
      W.label({ shot: "clean", text: "Nitrogen", sub: "dry", color: C.sky, at: new THREE.Vector3(-1.6, 0.3, 1), from: tN2, to: shot.to, dx: -170, dy: -130 });
    },
  });

  /* ======================= 9b. electron-microscope inspection ======================= */
  W.shot({
    id: "inspect",
    from: () => cue("inspect", "electron") - 0.15,
    to: () => slot("inspect").end,
    fadeIn: 0.25,
    setup(shot) {
      const s = W.newScene({ key: 1.0, rim: 1.2, amb: 0.1 });
      const cam = W.newCamera(30);
      const die = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.63), new THREE.MeshStandardMaterial({ map: W.dieTex(), metalness: 0.5, roughness: 0.35 }));
      die.rotation.x = -Math.PI / 2;
      s.add(die);
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.05), W.basic(C.lime, 0, true));
      scan.rotation.x = -Math.PI / 2;
      scan.position.y = 0.01;
      s.add(scan);
      const scanned = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), W.basic(C.lime, 0, true));
      scanned.rotation.x = -Math.PI / 2;
      scanned.position.y = 0.005;
      s.add(scanned);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 2, 32), W.mat.steel);
      s.add(column);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.05, 3, 12, 1, true), W.basic(C.lime, 0.0, true));
      s.add(beam);
      const spot = W.glow(C.lime, 0.5, 0);
      s.add(spot);
      const defect = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: 0x8b8274, roughness: 1 }));
      defect.position.set(1.3, 0.05, 0.55);
      s.add(defect);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.33, 48), W.basic(C.coral, 0));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(1.3, 0.02, 0.55);
      s.add(ring);
      const tScan = cue("inspect", "scan");
      const tFind = cue("inspect", "flaws");
      shot.scene = s;
      shot.camera = cam;
      shot.update = (t) => {
        // raster: rows from far edge toward the camera, beam sweeping left-right
        const k = ramp(t, tScan - 0.6, tFind + 0.35);
        const rows = 10;
        const z = lerp(-1.75, 0.55, k);
        const row = k * rows;
        const xr = (row % 1) * 8 - 4;
        const x = Math.floor(row) % 2 === 0 ? xr : -xr;
        const found = t > tFind + 0.35;
        const bx = found ? 1.3 : x,
          bz = found ? 0.55 : z;
        column.position.set(bx, 3.4, bz);
        beam.position.set(bx, 1.5, bz);
        beam.material.opacity = 0.6;
        spot.position.set(bx, 0.03, bz);
        spot.material.opacity = 0.9;
        scan.position.z = z;
        scan.material.opacity = found ? 0 : 0.5;
        scanned.scale.y = Math.max(0.001, z + 1.815);
        scanned.position.z = (-1.815 + z) / 2;
        scanned.material.opacity = 0.08;
        ring.material.opacity = found ? 0.95 : 0;
        const sc = 1 + 0.25 * Math.sin((t - tFind) * 8) * Math.exp(-(t - tFind) * 2);
        ring.scale.setScalar(found ? sc : 1);
        const zoom = sramp(t, tFind + 0.4, shot.to);
        W.aim(cam, [lerp(-1.2, 0.6, zoom), lerp(5.2, 2.4, zoom), lerp(5.4, 2.8, zoom)], [lerp(0, 1.1, zoom), 0, lerp(-0.2, 0.45, zoom)]);
      };
      W.label({ shot: "inspect", text: "Electron microscope", sub: "nanometer resolution", color: C.lime, at: () => new THREE.Vector3(column.position.x, 2.6, column.position.z), from: shot.from + 0.4, to: tFind, dx: 160, dy: -60 });
      W.label({ shot: "inspect", text: "Defect found", sub: "caught early", color: C.coral, at: new THREE.Vector3(1.6, 0.05, 0.55), from: tFind + 0.5, to: shot.to, dx: 180, dy: -100 });
    },
  });
})();
