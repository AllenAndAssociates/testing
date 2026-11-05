/* Helpers for the chapter overlay compositions (compositions/ch-*.html).
 * Times are local to a chapter's scene: 0 = the chapter slot's start (see World.slot). */
(function () {
  const W = window.World;
  const OV = (window.OV = {});
  OV.t = (ch, word, n = 1) => W.cue(ch, word, n) - W.slot(ch).start;
  OV.te = (ch, word, n = 1) => W.cueEnd(ch, word, n) - W.slot(ch).start;
  OV.len = (ch) => W.slot(ch).end - W.slot(ch).start;

  // chapter tag, top left: in at 0.35 s, out after `hold`
  OV.tag = function (tl, root, hold = 3.6) {
    const el = root.querySelector(".tag");
    const line = root.querySelector(".tag-line");
    tl.fromTo(el, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, 0.35);
    tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out" }, 0.45);
    tl.to(el, { opacity: 0, x: -12, duration: 0.4, ease: "power2.in" }, 0.35 + hold);
  };
  // a stat card: rises in at `a`, leaves at `b`
  OV.card = function (tl, el, a, b) {
    tl.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, a);
    if (b != null) tl.to(el, { opacity: 0, y: -10, duration: 0.35, ease: "power2.in" }, b - 0.35);
  };
  // whole-number count-up; survives the runtime's silent seeks because snap needs no callback
  OV.count = function (tl, el, from, to, a, d, ease = "power2.out") {
    el.innerText = String(from);
    tl.fromTo(el, { innerText: from }, { innerText: to, duration: d, ease, snap: { innerText: 1 } }, a);
  };
})();
