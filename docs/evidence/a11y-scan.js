// Scan helper: runs axe-core and re-checks every colour-contrast finding with a computed-colour walk, because axe
// cannot always resolve backgrounds (it reported white behind text that is visibly on a dark panel).
(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (el) => {
    const layers = []; let hasImage = false;
    for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none') hasImage = true; const c = parse(cs.backgroundColor); if (c && c.a > 0) layers.push(c); }
    let bg = { r: 255, g: 255, b: 255, a: 1 }; for (const l of layers.reverse()) bg = over(l, bg);
    // opacity of the element and of every ancestor multiplies into what the eye sees
    let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    const cs = getComputedStyle(el); const fgRaw = parse(cs.color); const fg = over({ ...fgRaw, a: fgRaw.a * op }, bg);
    const [a, b] = [lum(fg), lum(bg)]; const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = px >= 24 || (px >= 18.66 && bold);
    return { ratio: +ratio.toFixed(2), needs: large ? 3 : 4.5, ok: ratio >= (large ? 3 : 4.5), hasImage, px };
  };
  window.__scan = async () => {
    const r = await axe.run(document, { resultTypes: ['violations', 'incomplete'], elementRef: true });
    const real = [];
    const recheck = (list, kind) => list.filter((v) => v.id === 'color-contrast').forEach((v) => v.nodes.forEach((n) => { const c = contrast(n.element); if (!c.ok || c.hasImage) real.push({ kind, t: n.target.join(' ').slice(0, 70), text: (n.element.textContent || '').trim().slice(0, 35), ...c }); }));
    recheck(r.violations, 'axe-violation'); recheck(r.incomplete, 'axe-unsure');
    const other = r.violations.filter((v) => v.id !== 'color-contrast').map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => ({ t: n.target.join(' ').slice(0, 100), m: ((n.any[0] || n.all[0] || n.none[0] || {}).message || '').slice(0, 150) })) }));
    const unsure = r.incomplete.filter((v) => v.id !== 'color-contrast').map((v) => v.id + ' x' + v.nodes.length);
    const flagged = r.violations.concat(r.incomplete).filter((v) => v.id === 'color-contrast').reduce((s, v) => s + v.nodes.length, 0);
    return JSON.stringify({ page: location.pathname + location.search, otherViolations: other, contrastFlaggedByAxe: flagged, contrastReallyFailing: real, unsureOther: unsure, passes: r.passes.length }, null, 1);
  };
})();
