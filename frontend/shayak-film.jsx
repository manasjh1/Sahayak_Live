// Shayak — "the control layer" film. All motion keyed to T from useComposition().
const C = {
  ink: '#201e1d', n900: '#2e2b25', n800: '#474238', n700: '#645c50', n500: '#a19786',
  cream: '#f5ead8', sand: '#ebddc5',
  a300: '#ffc6a5', a400: '#f6a06b', a: '#c67139', a700: '#8c491a',
  s200: '#e1eecc', s300: '#ccdbb2', s400: '#aebf92', s: '#7a8a5e', s700: '#56633f',
};
const HEAD = '"Caprasimo", Georgia, serif';
const BODY = '"Figtree", system-ui, sans-serif';
const W = 1920, H = 1080;

const MOTION = { enter: Easing.easeOutCubic, draw: Easing.easeInOutCubic, pop: Easing.easeOutBack };
const tw = (T, from, to, start, end, ease = MOTION.enter) => animate({ from, to, start, end, ease })(T);
function kf(T, keys) {
  if (T <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (T <= keys[i][0]) return tw(T, keys[i - 1][1], keys[i][1], keys[i - 1][0], keys[i][0], MOTION.draw);
  }
  return keys[keys.length - 1][1];
}

// ── camera / projection ─────────────────────────────────────────────
function makeCam(T, CU, total) {
  const pitch = kf(T, [[0, 10], [CU.Unbound, 24], [CU.Shayak, 26], [CU.Shayak + 3, 32], [CU.Control + 1, 27], [CU.Trust, 27], [CU.Trust + 3, 44], [total, 46]]) * Math.PI / 180;
  const D = kf(T, [[0, 2700], [CU.Unbound, 1550], [CU.Shayak, 1380], [CU.Shayak + 3, 1750], [CU.Control + 1.5, 1450], [CU.Trust, 1350], [CU.Trust + 3.2, 2350], [total, 2450]]);
  const orbit = 0.6 + T * 0.07;
  const shakeAmt = tw(T, 0, 1, CU.Unbound + 1, CU.Unbound + 3) * (1 - tw(T, 0, 1, CU.Shayak + 1.6, CU.Shayak + 2.4));
  const cx = W / 2 + Math.sin(T * 37) * 5 * shakeAmt;
  const cy = 610 + Math.cos(T * 29) * 4 * shakeAmt;
  const f = 1150, cp = Math.cos(pitch), sp = Math.sin(pitch), co = Math.cos(orbit), so = Math.sin(orbit);
  const P = (x, y, z) => {
    const x1 = x * co - y * so, y1 = x * so + y * co;
    const u = z * cp + y1 * sp, d = y1 * cp - z * sp + D;
    const s = f / d;
    return { x: cx + x1 * s, y: cy - u * s, s, d };
  };
  return { P, D, pitch, orbit, shakeAmt };
}
const polar = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];

// ── data ────────────────────────────────────────────────────────────
const CORE_Z = 170;
const LAYERS = [{ r: 240, h: 22 }, { r: 320, h: 26 }, { r: 400, h: 30 }];
const GUARD_R = 400;
const NODE_ANG = [0.4, 2.0, 3.55, 5.1];
const NODES = ['Companies', 'People', 'Teams', 'Developers'];

const ROGUE = [
  ['delete_logs()', 0.2], ['read payroll.db', 1.3], ['email → all staff', 2.5], ['wire $40,000', 3.6],
  ['scrape customer PII', 4.6], ['disable audit trail', 5.5], ['push to prod', 0.8], ['copy secrets', 3.0],
  [null, 1.9], [null, 4.1], [null, 5.0], [null, 2.2], [null, 0.5], [null, 3.3], [null, 5.8], [null, 1.1],
];
const CTRL = [
  ['summarize Q3 report', true], ['export customer PII', false], ['draft reply to client', true], ['translate contract', true],
  ['wire funds externally', false], ['schedule review', true], ['delete_logs()', false], ['tag support tickets', true],
  ['forecast demand', true], ['override safety policy', false], ['answer HR question', true], ['generate unit tests', true],
];

function rogueList(CU) {
  return ROGUE.map(([label, a], i) => ({ label, a: a + i * 0.13, t0: CU.Unbound + 0.25 + i * 0.34, dur: 2.0 + (i % 3) * 0.3 }));
}
function ctrlList(CU) {
  let k = 0;
  return CTRL.map(([label, ok], i) => {
    const a = ok ? NODE_ANG[(k++) % 4] + ((i % 2) ? 0.06 : -0.06) : 0.9 + i * 0.83;
    return { label, ok, a, t0: CU.Control + 0.3 + i * 0.62, out: 0.85, on: 0.9 };
  });
}

// ── 3D pieces ───────────────────────────────────────────────────────
function Floor({ cam, T, CU }) {
  const { P } = cam;
  const o = tw(T, 0, 1, 0.3, 2.2);
  const lines = [];
  const R = 1300, step = 130;
  for (let v = -R; v <= R; v += step) {
    const a = P(v, -R, 0), b = P(v, R, 0), c = P(-R, v, 0), d = P(R, v, 0);
    lines.push(<line key={'x' + v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
    lines.push(<line key={'y' + v} x1={c.x} y1={c.y} x2={d.x} y2={d.y} />);
  }
  const ring = (r, z) => {
    let p = '';
    for (let i = 0; i <= 72; i++) { const q = P(...polar(r, i / 72 * Math.PI * 2, z)); p += (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }
    return p;
  };
  const c0 = P(0, 0, 0);
  const glowR = 420 * c0.s;
  const calm = tw(T, 0, 1, CU.Shayak + 2, CU.Shayak + 3);
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: o }}>
      <defs>
        <radialGradient id="fl" cx={c0.x} cy={c0.y} r={1100 * c0.s} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="flm"><rect width={W} height={H} fill="url(#fl)" /></mask>
        <radialGradient id="pool" cx={c0.x} cy={c0.y} r={glowR} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${c0.x} ${c0.y}) scale(1 ${Math.max(0.15, Math.sin(cam.pitch))}) translate(${-c0.x} ${-c0.y})`}>
          <stop offset="0" stopColor={calm > 0.5 ? C.s400 : C.a400} stopOpacity="0.35" />
          <stop offset="1" stopColor={C.a} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g mask="url(#flm)" stroke={C.n700} strokeWidth="1.4" opacity="0.55">{lines}</g>
      <g mask="url(#flm)" fill="none" stroke={C.n500} strokeWidth="1.5" opacity="0.35">
        <path d={ring(650, 0)} strokeDasharray="4 10" />
        <path d={ring(950, 0)} />
      </g>
      <rect width={W} height={H} fill="url(#pool)" />
    </svg>
  );
}

function bandPaths(P, r, z0, h, front, coreD) {
  const N = 96, top = [], bot = [];
  const segs = [];
  let cur = null;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2;
    const pt = P(...polar(r, a, z0 + h)), pb = P(...polar(r, a, z0 - h));
    const isFront = pt.d < coreD;
    if (isFront === front) { if (!cur) { cur = { t: [], b: [] }; segs.push(cur); } cur.t.push(pt); cur.b.push(pb); }
    else cur = null;
  }
  return segs.map(sg => {
    let d = sg.t.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('');
    d += sg.b.slice().reverse().map(p => 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('') + 'Z';
    const edge = sg.t.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('');
    return { d, edge };
  });
}

function layerState(T, CU, i) {
  const s = CU.Shayak + 0.5 + i * 0.45;
  const z = tw(T, 1400, CORE_Z, s, s + 1.5, MOTION.pop);
  const o = tw(T, 0, 1, s, s + 0.6);
  return { z, o };
}

function Layers({ cam, T, CU, front, hits }) {
  const { P } = cam;
  const coreD = P(0, 0, CORE_Z).d;
  const lockFlash = tw(T, 1, 0, CU.Shayak + 3.4, CU.Shayak + 4.6) * (T > CU.Shayak + 3.3 ? 1 : 0);
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
      {LAYERS.map((L, i) => {
        const st = layerState(T, CU, i);
        if (st.o <= 0) return null;
        const segs = bandPaths(P, L.r, st.z, L.h, front, coreD);
        const spin = T * (0.35 + i * 0.12) * (i % 2 ? -1 : 1);
        const ticks = [];
        for (let k = 0; k < 18; k++) {
          const a = spin + k / 18 * Math.PI * 2;
          const p = P(...polar(L.r, a, st.z + L.h));
          if ((p.d < coreD) !== front) continue;
          ticks.push(<circle key={k} cx={p.x} cy={p.y} r={Math.max(2, 5 * p.s)} fill={C.s200} />);
        }
        return (
          <g key={i} opacity={st.o * (front ? 1 : 0.55)}>
            {segs.map((sg, j) => (
              <g key={j}>
                <path d={sg.d} fill={C.s} fillOpacity={0.22 + lockFlash * 0.35} stroke={C.s300} strokeWidth="2.5" strokeLinejoin="round" />
                <path d={sg.edge} fill="none" stroke={lockFlash > 0 ? C.s200 : C.s300} strokeWidth={3 + lockFlash * 4} />
              </g>
            ))}
            {ticks}
          </g>
        );
      })}
      {front && hits.map((h, i) => {
        const p = P(...polar(GUARD_R, h.a, CORE_Z));
        return <circle key={i} cx={p.x} cy={p.y} r={(20 + h.k * 90) * p.s} fill="none" stroke={C.a400} strokeWidth={5 * (1 - h.k) + 1} opacity={1 - h.k} />;
      })}
    </svg>
  );
}

function Core({ cam, T, CU }) {
  const p = cam.P(0, 0, CORE_Z + Math.sin(T * 1.6) * 10);
  const ignite = tw(T, 0, 1, 0.8, 2.4, MOTION.pop);
  const agitate = tw(T, 0, 1, CU.Unbound, CU.Unbound + 1.5) * (1 - tw(T, 0, 1, CU.Shayak + 2.4, CU.Shayak + 3.6));
  const calm = tw(T, 0, 1, CU.Shayak + 2.6, CU.Shayak + 3.8);
  const pulse = 1 + Math.sin(T * (3 + agitate * 9)) * (0.03 + agitate * 0.06);
  const size = 150 * p.s * ignite * pulse;
  const halo = size * (2.6 + agitate * 0.8);
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, width: 0, height: 0 }}>
      <div style={{ position: 'absolute', left: -halo / 2, top: -halo / 2, width: halo, height: halo, borderRadius: '50%',
        background: `radial-gradient(circle, ${calm > 0.5 ? 'rgba(174,191,146,0.45)' : 'rgba(246,160,107,0.5)'} 0%, rgba(198,113,57,0) 65%)`, opacity: ignite }} />
      <div style={{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, ${C.cream} 0%, ${C.a300} 22%, ${C.a} 58%, ${C.a700} 100%)`,
        boxShadow: `0 0 ${60 * p.s}px ${C.a400}` }} />
      <div style={{ position: 'absolute', left: -size * 0.66, top: -size * 0.66, width: size * 1.32, height: size * 1.32, borderRadius: '50%',
        border: `${Math.max(2, 4 * p.s)}px solid ${C.s300}`, opacity: calm * ignite, transform: `scale(${1 + Math.sin(T * 2) * 0.04})` }} />
      <div style={{ position: 'absolute', left: -200, width: 400, top: -size / 2 - 48 * p.s - Math.max(14, 20 * p.s), textAlign: 'center', fontFamily: BODY, fontWeight: 700,
        fontSize: Math.max(14, 20 * p.s), letterSpacing: '0.24em', color: C.sand, opacity: tw(T, 0, 1, 2, 3) }}>AI MODEL</div>
    </div>
  );
}

function Chip({ x, y, s, text, tone, o }) {
  const bg = tone === 'ok' ? C.s700 : tone === 'no' ? C.a700 : C.n800;
  const bd = tone === 'ok' ? C.s300 : tone === 'no' ? C.a400 : C.a400;
  const fs = Math.max(15, Math.min(26, 22 * s));
  return (
    <div style={{ position: 'absolute', left: x, top: y - 46 * s - fs, transform: 'translateX(-50%)', opacity: o, whiteSpace: 'nowrap',
      padding: `${fs * 0.35}px ${fs * 0.75}px`, borderRadius: 999, background: bg, border: `2px solid ${bd}`, color: C.cream,
      fontFamily: BODY, fontWeight: 600, fontSize: fs, boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>{text}</div>
  );
}

function Packets({ cam, T, CU }) {
  const { P } = cam;
  const dots = [], chips = [];
  rogueList(CU).forEach((k, i) => {
    const u = (T - k.t0) / k.dur;
    if (u < 0 || u > 1) return;
    const r = 60 + Math.pow(u, 1.4) * 1400;
    const z = CORE_Z + Math.sin(u * 3 + i) * 40;
    const a = k.a + u * 0.3;
    const p = P(...polar(r, a, z)), q = P(...polar(Math.max(60, r - 180), a - 0.04, z));
    const o = Math.min(1, u * 6) * Math.min(1, (1 - u) * 4);
    dots.push(<g key={'r' + i} opacity={o}>
      <line x1={q.x} y1={q.y} x2={p.x} y2={p.y} stroke={C.a400} strokeWidth={8 * p.s} strokeLinecap="round" opacity="0.6" />
      <circle cx={p.x} cy={p.y} r={12 * p.s} fill={C.a300} />
    </g>);
    if (k.label && u < 0.7) chips.push(<Chip key={'rc' + i} x={p.x} y={p.y} s={p.s} text={k.label} tone="warn" o={o * Math.min(1, (0.7 - u) * 6)} />);
  });
  const hits = [];
  ctrlList(CU).forEach((k, i) => {
    const t = T - k.t0;
    const total = k.ok ? k.out + k.on : k.out + 1.0;
    if (t < 0 || t > total) return;
    let r, col, o = 1, tone = null, label = k.label;
    if (t < k.out) { r = 70 + (GUARD_R - 70) * MOTION.draw(t / k.out); col = C.a300; }
    else if (k.ok) {
      const v = (t - k.out) / k.on; r = GUARD_R + (650 - GUARD_R) * MOTION.enter(v); col = C.s200; tone = 'ok';
      o = Math.min(1, (1 - v) * 3); label = '✓ ' + k.label;
    } else {
      const v = (t - k.out) / 1.0; r = GUARD_R - 30 * MOTION.enter(v); col = C.a400; tone = 'no';
      o = 1 - v; label = '✕ BLOCKED · ' + k.label;
      hits.push({ a: k.a, k: v });
    }
    const p = P(...polar(r, k.a, CORE_Z)), q = P(...polar(Math.max(70, r - 140), k.a, CORE_Z));
    dots.push(<g key={'c' + i} opacity={o}>
      <line x1={q.x} y1={q.y} x2={p.x} y2={p.y} stroke={col} strokeWidth={7 * p.s} strokeLinecap="round" opacity="0.55" />
      <circle cx={p.x} cy={p.y} r={12 * p.s} fill={col} />
    </g>);
    chips.push(<Chip key={'cc' + i} x={p.x} y={p.y} s={p.s} text={label} tone={tone} o={o * Math.min(1, t * 5)} />);
  });
  return { svg: <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>{dots}</svg>, chips, hits };
}

function Nodes({ cam, T, CU }) {
  const { P } = cam;
  return (
    <React.Fragment>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {NODE_ANG.map((a, i) => {
          const s = CU.Trust + 1.2 + i * 0.25;
          const g = tw(T, 0, 1, s, s + 1.2, MOTION.draw);
          if (g <= 0) return null;
          const p0 = P(...polar(GUARD_R, a, 0)), p1 = P(...polar(GUARD_R + (720 - GUARD_R) * g, a, 0));
          const flow = (T * 1.2 + i * 0.25) % 1;
          const pf = P(...polar(GUARD_R + (720 - GUARD_R) * flow, a, 0));
          return <g key={i}>
            <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={C.s300} strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
            {g >= 1 && <circle cx={pf.x} cy={pf.y} r={8 * pf.s} fill={C.s200} />}
          </g>;
        })}
      </svg>
      {NODE_ANG.map((a, i) => {
        const s = CU.Trust + 2.0 + i * 0.25;
        const o = tw(T, 0, 1, s, s + 0.5);
        const k = tw(T, 0.6, 1, s, s + 0.7, MOTION.pop);
        if (o <= 0) return null;
        const p = P(...polar(760, a, 0));
        const fs = Math.max(18, 30 * p.s);
        return (
          <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%,-50%) scale(${k})`, opacity: o,
            display: 'flex', alignItems: 'center', gap: fs * 0.5, padding: `${fs * 0.45}px ${fs * 0.9}px ${fs * 0.45}px ${fs * 0.5}px`,
            borderRadius: 999, background: C.cream, color: C.ink, fontFamily: HEAD, fontSize: fs, whiteSpace: 'nowrap', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ width: fs * 1.1, height: fs * 1.1, borderRadius: '50%', background: i % 2 ? C.a : C.s }} />
            {NODES[i]}
          </div>
        );
      })}
    </React.Fragment>
  );
}

// ── HUD ─────────────────────────────────────────────────────────────
function Status({ T, CU }) {
  const on = tw(T, 0, 1, CU.Unbound + 0.6, CU.Unbound + 1.2);
  const ctl = T > CU.Shayak + 3.3;
  const blink = ctl ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(T * 5));
  return (
    <div style={{ position: 'absolute', right: 80, top: 110, opacity: on * (1 - tw(T, 0, 1, CU.Trust + 2.6, CU.Trust + 3.2)), display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 26px', borderRadius: 999, background: ctl ? C.s700 : C.a700, border: `2px solid ${ctl ? C.s300 : C.a400}`,
      color: C.cream, fontFamily: BODY, fontWeight: 700, fontSize: 24, letterSpacing: '0.16em' }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: ctl ? C.s200 : C.a300, opacity: blink }} />
      {ctl ? 'CONTROLLED BY SHAYAK' : 'UNCONTROLLED'}
    </div>
  );
}

function TitleCard({ T, CU }) {
  const s = CU.Shayak + 3.3;
  const o = tw(T, 0, 1, s, s + 0.7) * (1 - tw(T, 0, 1, CU.Control + 0.6, CU.Control + 1.4));
  const y = tw(T, 40, 0, s, s + 1.2);
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 120, top: 150 + y, opacity: o }}>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 24, letterSpacing: '0.3em', color: C.s300 }}>INTRODUCING</div>
      <div style={{ fontFamily: HEAD, fontSize: 168, lineHeight: 1, color: C.cream, letterSpacing: '-0.02em', marginTop: 10 }}>Shayak</div>
      <div style={{ fontFamily: BODY, fontSize: 34, color: C.sand, marginTop: 18 }}>The control layer for AI.</div>
    </div>
  );
}

function LogPanel({ T, CU }) {
  const o = tw(T, 0, 1, CU.Control + 0.8, CU.Control + 1.5) * (1 - tw(T, 0, 1, CU.Trust + 0.4, CU.Trust + 1.2));
  const x = tw(T, 80, 0, CU.Control + 0.8, CU.Control + 1.6);
  if (o <= 0) return null;
  const list = ctrlList(CU).filter(k => T >= k.t0 + k.out).reverse().slice(0, 6);
  const allowed = 1284 + ctrlList(CU).filter(k => k.ok && T >= k.t0 + k.out).length;
  const blocked = 37 + ctrlList(CU).filter(k => !k.ok && T >= k.t0 + k.out).length;
  return (
    <div style={{ position: 'absolute', right: 80, top: 200, width: 560, opacity: o, transform: `translateX(${x}px)`,
      background: 'rgba(46,43,37,0.88)', border: `2px solid ${C.n700}`, borderRadius: 28, padding: 30, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
      <div style={{ fontFamily: HEAD, fontSize: 32, color: C.cream }}>Decision log</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 18 }}>
        <div style={{ flex: 1, borderRadius: 16, background: C.s700, padding: '14px 18px' }}>
          <div style={{ fontFamily: BODY, fontSize: 20, color: C.s200, fontWeight: 600 }}>Allowed</div>
          <div style={{ fontFamily: HEAD, fontSize: 42, color: C.cream }}>{allowed.toLocaleString()}</div>
        </div>
        <div style={{ flex: 1, borderRadius: 16, background: C.a700, padding: '14px 18px' }}>
          <div style={{ fontFamily: BODY, fontSize: 20, color: C.a300, fontWeight: 600 }}>Blocked</div>
          <div style={{ fontFamily: HEAD, fontSize: 42, color: C.cream }}>{blocked}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, height: 6 * 54 }}>
        {list.map((k) => {
          const age = T - (k.t0 + k.out);
          return (
            <div key={k.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: 44,
              opacity: Math.min(1, age * 4), fontFamily: BODY, fontSize: 22, color: C.sand }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</span>
              <span style={{ flexShrink: 0, padding: '4px 14px', borderRadius: 999, fontSize: 18, fontWeight: 700, letterSpacing: '0.08em',
                background: k.ok ? C.s300 : C.a300, color: k.ok ? C.s700 : C.a700 }}>{k.ok ? 'ALLOWED' : 'BLOCKED'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndCard({ T, CU, total }) {
  const s = CU.Trust + 3.4;
  const o = tw(T, 0, 1, s, s + 0.8);
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 130 + tw(T, 30, 0, s, s + 1.2), textAlign: 'center', opacity: o }}>
      <div style={{ fontFamily: HEAD, fontSize: 120, lineHeight: 1, color: C.cream }}>Shayak</div>
      <div style={{ fontFamily: BODY, fontSize: 36, color: C.sand, marginTop: 16 }}>Keep AI safe. Keep it in your control.</div>
      <Waitlist T={T} CU={CU} />
    </div>
  );
}

// ── Waitlist — real interactive form backed by the FastAPI / PostgreSQL API ──
const API_URL = (window.SHAYAK_API_URL || '') + '/api/waitlist';

function Waitlist({ T, CU }) {
  const s = CU.Waitlist;
  const o = tw(T, 0, 1, s, s + 0.6);
  const y = tw(T, 24, 0, s, s + 0.8);

  // Local interactive state (independent of the film timeline)
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState('idle'); // idle | loading | done | duplicate | error
  const [errorMsg, setErrorMsg] = React.useState('');
  const inputRef = React.useRef(null);

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isDone = status === 'done' || status === 'duplicate';

  async function handleSubmit() {
    if (!isValid || isDone || status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatus(data.already_registered ? 'duplicate' : 'done');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Try again.');
      setStatus('error');
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSubmit();
  }

  const btnBg = isDone ? C.s : status === 'loading' ? C.n700 : C.a;
  const btnLabel =
    status === 'loading'  ? 'Joining…'           :
    status === 'done'     ? "✓ You're on the list":
    status === 'duplicate'? '✓ Already registered':
    status === 'error'    ? 'Try again'           : 'Join the waitlist';

  return (
    <div style={{ marginTop: 56, opacity: o, transform: `translateY(${y}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 24, letterSpacing: '0.24em', color: C.s300 }}>
        PUT YOUR EMAIL TO JOIN THE WAITLIST
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 10, borderRadius: 999,
        background: C.n900, border: `2px solid ${C.n700}`, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
        <input
          ref={inputRef}
          type="email"
          placeholder="you@company.com"
          value={email}
          disabled={isDone || status === 'loading'}
          onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
          onKeyDown={handleKey}
          style={{
            width: 520, height: 76, borderRadius: 999, background: C.cream,
            border: 'none', outline: 'none', padding: '0 34px',
            fontFamily: BODY, fontSize: 30,
            color: email ? C.ink : C.n500,
            opacity: isDone ? 0.7 : 1,
          }}
        />
        <div
          onClick={handleSubmit}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          style={{
            height: 76, padding: '0 40px', borderRadius: 999,
            display: 'flex', alignItems: 'center', gap: 12,
            background: btnBg, color: C.cream,
            fontFamily: HEAD, fontSize: 30, whiteSpace: 'nowrap',
            cursor: isDone || status === 'loading' ? 'default' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {btnLabel}
        </div>
      </div>
      {status === 'error' && (
        <div style={{ fontFamily: BODY, fontSize: 18, color: C.a300, marginTop: 4 }}>
          ⚠ {errorMsg}
        </div>
      )}
    </div>
  );
}

// ── piece ───────────────────────────────────────────────────────────
function Piece({ t }) {
  const { T, CUES: CU, authoredTotal: total } = useComposition();
  const cam = makeCam(T, CU, total);
  const pk = Packets({ cam, T, CU });
  const fade = Math.max(tw(T, 1, 0, 0, 1.0), tw(T, 0, 1, total - 0.9, total));
  const bar = t.letterbox ? 72 : 0;
  const rootRef = React.useRef(null);
  const sec = Math.floor(T);
  React.useEffect(() => { const el = rootRef.current; if (el) el.setAttribute('data-screen-label', `t=${sec}s`); }, [sec]);
  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: BODY,
      background: `radial-gradient(ellipse at 50% 55%, ${C.n800} 0%, ${C.n900} 45%, ${C.ink} 100%)` }}>
      <div style={{ position: 'absolute', inset: 0, opacity: tw(T, 1, 0.15, CU.Waitlist - 0.3, CU.Waitlist + 0.6) }}>
      <Floor cam={cam} T={T} CU={CU} />
      <Nodes cam={cam} T={T} CU={CU} />
      <Layers cam={cam} T={T} CU={CU} front={false} hits={[]} />
      <Core cam={cam} T={T} CU={CU} />
      {pk.svg}
      <Layers cam={cam} T={T} CU={CU} front={true} hits={pk.hits} />
      {pk.chips}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(32,30,29,0) 55%, rgba(32,30,29,0.75) 100%)', pointerEvents: 'none' }} />
      <TitleCard T={T} CU={CU} />
      <LogPanel T={T} CU={CU} />
      <Status T={T} CU={CU} />
      <EndCard T={T} CU={CU} total={total} />
      {t.captions && <Captions style={{ bottom: bar + 46, font: `600 34px ${BODY}`, color: C.cream }} items={[
        { at: 1.4, until: CU.Unbound - 0.2, text: 'An AI wakes up.' },
        { at: CU.Unbound + 0.8, until: CU.Shayak - 0.1, text: 'Powerful. Fast. Acting on its own.' },
        { at: CU.Shayak + 0.4, until: CU.Shayak + 3.1, text: 'So we add a layer.' },
        { at: CU.Control + 0.6, until: CU.Trust - 0.1, text: 'Every action checked against your rules. Every decision logged.' },
        { at: CU.Trust + 0.1, until: CU.Trust + 2.0, text: 'Safe AI for companies and the people who use it.' },
      ]} />}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: C.ink }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar, background: C.ink }} />
      <div style={{ position: 'absolute', inset: 0, background: C.ink, opacity: fade, pointerEvents: 'none' }} />
    </div>
  );
}

function ShayakFilm() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.ink}>
        <Piece t={t} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Film" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
        <TweakToggle label="Captions" value={t.captions} onChange={(v) => setTweak('captions', v)} />
        <TweakToggle label="Letterbox bars" value={t.letterbox} onChange={(v) => setTweak('letterbox', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.ShayakFilm = ShayakFilm;
