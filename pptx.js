// PowerPoint (.pptx) → PDF, entirely in the browser.
// Each slide is redrawn with jsPDF using real text, so the result can be highlighted,
// searched and annotated exactly like any other PDF. Covers text boxes and placeholders
// (with master/layout inheritance), shapes, pictures, groups, tables, SmartArt drawings
// and backgrounds. Charts, video and EMF/WMF pictures are left out and counted.
'use strict';
const PPTX = (() => {
  const EMU = 12700; // EMU per point

  /* ---------- Zip (uses the browser's own deflate) ---------- */
  async function unzip(buf){
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for(let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
    if(eocd < 0) throw new Error('not a zip');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const entries = new Map(), dec = new TextDecoder();
    for(let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++){
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      entries.set(name.toLowerCase(), { name, method, size, off });
      p += 46 + nl + xl + cl;
    }
    const cache = new Map();
    async function bytes(name){
      const e = entries.get(String(name).toLowerCase()); if(!e) return null;
      if(cache.has(e.name)) return cache.get(e.name);
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const raw = u8.subarray(start, start + e.size);
      let out;
      if(e.method === 0) out = raw.slice();
      else if(e.method === 8) out = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else throw new Error('unsupported zip method');
      cache.set(e.name, out); return out;
    }
    return { has:n => entries.has(String(n).toLowerCase()), bytes, text: async n => { const b = await bytes(n); return b ? dec.decode(b) : null; } };
  }

  /* ---------- XML helpers (by local name, so prefixes never matter) ---------- */
  const parseXml = s => new DOMParser().parseFromString(s, 'application/xml').documentElement;
  const kids = (el, n) => el ? [...el.children].filter(c => !n || c.localName === n) : [];
  const kid = (el, n) => { if(!el) return null; for(const c of el.children) if(c.localName === n) return c; return null; };
  const at = (el, ...ns) => ns.reduce((e, n) => kid(e, n), el);
  const attr = (el, a) => el ? el.getAttribute(a) : null;
  const rid = (el, a) => { if(!el) return null; for(const x of el.attributes) if(x.localName === a && x.prefix) return x.value; return null; };
  const num = (v, d) => v == null || v === '' || isNaN(+v) ? d : +v;
  const first = (list, fn) => { for(const x of list){ const v = fn(x); if(v != null) return v; } return null; };

  function joinPath(base, target){
    if(target.startsWith('/')) return target.slice(1);
    const parts = base.split('/'); parts.pop();
    for(const s of target.split('/')){ if(s === '..') parts.pop(); else if(s && s !== '.') parts.push(s); }
    return parts.join('/');
  }

  /* ---------- Text encoding for the PDF's standard fonts ---------- */
  const WIN = { 0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86, 0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A, 0x2039:0x8B, 0x0152:0x8C, 0x017D:0x8E,
    0x2018:0x91, 0x2019:0x92, 0x201C:0x93, 0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97, 0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B, 0x0153:0x9C, 0x017E:0x9E, 0x0178:0x9F };
  // Greek letters and maths signs exist in the Symbol font, so slides on science topics keep them
  const SYM = {};
  'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ'.split('').forEach((c, i) => SYM[c.charCodeAt(0)] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charCodeAt(i));
  'αβχδεφγηιϕκλμνοπθρστυϖωξψζ'.split('').forEach((c, i) => SYM[c.charCodeAt(0)] = 'abcdefghijklmnopqrstuvwxyz'.charCodeAt(i));
  Object.assign(SYM, { 0x2206:0x44, 0x2126:0x57, 0x2264:0xA3, 0x2265:0xB3, 0x221E:0xA5, 0x2190:0xAC, 0x2191:0xAD, 0x2192:0xAE, 0x2193:0xAF, 0x2194:0xAB,
    0x2260:0xB9, 0x2261:0xBA, 0x2248:0xBB, 0x2202:0xB6, 0x2211:0xE5, 0x220F:0xD5, 0x222B:0xF2, 0x221A:0xD6, 0x2200:0x22, 0x2203:0x24, 0x2208:0xCE, 0x2209:0xCF,
    0x2229:0xC7, 0x222A:0xC8, 0x2282:0xCC, 0x2283:0xC9, 0x2286:0xCD, 0x2287:0xCA, 0x2205:0xC6, 0x2207:0xD1, 0x2234:0x5C, 0x22A5:0x5E, 0x2032:0xA2, 0x2033:0xB2,
    0x2022:0xB7, 0x21D2:0xDE, 0x21D4:0xDB, 0x21D0:0xDC, 0x2227:0xD9, 0x2228:0xDA, 0x00AC:0xD8, 0x2245:0x40, 0x221D:0xB5, 0x2218:0xB0, 0x22C5:0xD7, 0x2032:0xA2 });
  // jsPDF has no metrics for Symbol, so widths (from the Adobe Symbol AFM, in 1/1000 em) live here
  const SYM_W = {};
  [['ABCDEFGHIJKLMNOPQRSTUVWXYZ', [722,667,722,612,611,763,603,722,333,631,722,686,889,722,722,768,741,556,592,611,690,439,768,645,795,611]],
   ['abcdefghijklmnopqrstuvwxyz', [631,549,549,494,439,521,411,603,329,603,549,549,576,521,549,549,521,549,603,439,576,713,686,493,686,494]]]
    .forEach(([cs, ws]) => cs.split('').forEach((c, i) => SYM_W[c.charCodeAt(0)] = ws[i]));
  Object.assign(SYM_W, { 0xA3:549, 0xB3:549, 0xA5:713, 0xAC:987, 0xAD:603, 0xAE:987, 0xAF:603, 0xAB:1042, 0xB9:549, 0xBA:549, 0xBB:549, 0xB6:494, 0xE5:713, 0xD5:823,
    0xF2:274, 0xD6:549, 0x22:713, 0x24:549, 0xCE:713, 0xCF:713, 0xC7:768, 0xC8:768, 0xCC:713, 0xC9:713, 0xCD:713, 0xCA:713, 0xC6:823, 0xD1:713, 0x5C:863, 0x5E:658,
    0xA2:247, 0xB2:411, 0xB7:460, 0xDE:987, 0xDB:1042, 0xDC:987, 0xD9:603, 0xDA:603, 0xD8:713, 0x40:549, 0xB5:713, 0xB0:400, 0xD7:250 });
  const symWidth = s => [...s].reduce((w, c) => w + (SYM_W[c.charCodeAt(0)] || 600), 0) / 1000;
  // Characters with a plain stand-in: sub- and superscript digits, other dashes, bullets and spaces
  const PLAIN = { 0x2212:'-', 0x2010:'-', 0x2011:'-', 0x2070:'0', 0x2074:'4', 0x2075:'5', 0x2076:'6', 0x2077:'7', 0x2078:'8', 0x2079:'9', 0x207A:'+', 0x207B:'-', 0x208A:'+', 0x208B:'-',
    0x2043:'-', 0x25A0:'\u2022', 0x25AA:'\u2022', 0x25CF:'\u2022', 0x25E6:'o', 0x2219:'\u2022', 0x2027:'\u00B7', 0x2715:'x', 0x2713:'v', 0x2714:'v', 0x00A0:' ' };
  for(let k = 0; k < 10; k++) PLAIN[0x2080 + k] = String(k);
  for(let k = 0x2000; k <= 0x200A; k++) PLAIN[k] = ' ';
  PLAIN[0x202F] = ' '; PLAIN[0x200B] = ''; PLAIN[0xFEFF] = '';
  const winChar = c => { const k = c.charCodeAt(0); return k < 0x80 || (k >= 0xA0 && k <= 0xFF) ? c : WIN[k] != null ? String.fromCharCode(WIN[k]) : null; };
  // Splits a string into pieces that each use one PDF font: normal text, or Symbol
  function encodePieces(s){
    const out = []; let cur = null;
    for(let c of s.normalize('NFC')){
      const k0 = c.codePointAt(0); if(PLAIN[k0] != null){ c = PLAIN[k0]; if(!c) continue; }
      let sym = false, ch = c.length === 1 ? winChar(c) : null, m = c;
      if(ch == null){ const k = c.codePointAt(0); if(SYM[k] != null){ sym = true; ch = String.fromCharCode(SYM[k]); } else ch = m = '?'; }
      if(!cur || cur.sym !== sym){ cur = { sym, enc:'', raw:'' }; out.push(cur); }
      cur.enc += ch; cur.raw += m;   // raw is what jsPDF measures: it knows the Unicode widths of the standard fonts
    }
    return out;
  }

  /* ---------- Colors ---------- */
  const PRST = { black:'000000', white:'FFFFFF', red:'FF0000', green:'008000', blue:'0000FF', yellow:'FFFF00', gray:'808080', grey:'808080', darkGray:'A9A9A9', lightGray:'D3D3D3', orange:'FFA500', purple:'800080', navy:'000080', cyan:'00FFFF', magenta:'FF00FF', maroon:'800000', silver:'C0C0C0' };
  const COLOR_TAGS = new Set(['srgbClr','schemeClr','sysClr','prstClr','scrgbClr','hslClr']);
  const hex2rgb = h => { h = (h || '000000').replace('#',''); return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]; };
  function rgb2hsl([r,g,b]){ r/=255; g/=255; b/=255; const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2; let h = 0, s = 0;
    if(mx !== mn){ const d = mx - mn; s = l > .5 ? d/(2-mx-mn) : d/(mx+mn); h = mx === r ? (g-b)/d + (g < b ? 6 : 0) : mx === g ? (b-r)/d + 2 : (r-g)/d + 4; h /= 6; }
    return [h,s,l]; }
  function hsl2rgb([h,s,l]){ if(!s) return [l*255,l*255,l*255]; const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
    const f = t => { t = (t+1)%1; return t < 1/6 ? p+(q-p)*6*t : t < .5 ? q : t < 2/3 ? p+(q-p)*(2/3-t)*6 : p; };
    return [f(h+1/3)*255, f(h)*255, f(h-1/3)*255]; }
  // el: an element that holds a color child (solidFill, buClr, gs, fgClr...)
  function colorOf(el, ctx, phClr){
    if(!el) return null;
    const c = COLOR_TAGS.has(el.localName) ? el : [...el.children].find(k => COLOR_TAGS.has(k.localName)); if(!c) return null;
    let rgb, a = 1; const v = attr(c, 'val');
    switch(c.localName){
      case 'srgbClr': rgb = hex2rgb(v); break;
      case 'sysClr': rgb = hex2rgb(attr(c, 'lastClr') || (v === 'window' ? 'FFFFFF' : '000000')); break;
      case 'prstClr': rgb = hex2rgb(PRST[v] || '000000'); break;
      case 'scrgbClr': rgb = ['r','g','b'].map(k => clampC(Math.pow(num(attr(c,k),0)/100000, 1/2.2)*255)); break;
      case 'hslClr': rgb = hsl2rgb([num(attr(c,'hue'),0)/21600000, num(attr(c,'sat'),0)/100000, num(attr(c,'lum'),0)/100000]); break;
      case 'schemeClr':
        if(v === 'phClr'){ if(!phClr) return null; rgb = phClr.rgb.slice(); a = phClr.a; }
        else rgb = hex2rgb(ctx.theme.colors[ctx.clrMap[v] || v] || '000000');
        break;
    }
    for(const m of c.children){
      const val = num(attr(m, 'val'), 0) / 100000;
      if(m.localName === 'alpha') a = val;
      else if(m.localName === 'lumMod' || m.localName === 'lumOff' || m.localName === 'satMod'){
        const h = rgb2hsl(rgb);
        if(m.localName === 'lumMod') h[2] *= val; else if(m.localName === 'lumOff') h[2] += val; else h[1] *= val;
        h[1] = Math.min(1, Math.max(0, h[1])); h[2] = Math.min(1, Math.max(0, h[2])); rgb = hsl2rgb(h);
      }
      // Tint and shade work on linear light, which is why a 75% tint of black is a mid grey
      else if(m.localName === 'tint') rgb = rgb.map(x => toSrgb(1 - (1 - toLin(x)) * val));
      else if(m.localName === 'shade') rgb = rgb.map(x => toSrgb(toLin(x) * val));
    }
    return { rgb: rgb.map(clampC), a };
  }
  const clampC = x => Math.round(Math.max(0, Math.min(255, x)));
  const toLin = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const toSrgb = l => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(Math.max(0, l), 1 / 2.4) - 0.055);

  /* ---------- Fills and lines ---------- */
  // Returns { none:true } | { color } | { blip } | null when the element says nothing
  function fillOf(pr, ctx, phClr){
    if(!pr) return null;
    for(const f of pr.children){
      switch(f.localName){
        case 'noFill': return { none:true };
        case 'solidFill': return { color: colorOf(f, ctx, phClr) };
        case 'gradFill': {
          const stops = kids(at(f, 'gsLst'), 'gs').map(g => colorOf(g, ctx, phClr)).filter(Boolean);
          if(!stops.length) return null;
          const avg = [0,1,2].map(i => stops.reduce((s, c) => s + c.rgb[i], 0) / stops.length);
          return { color:{ rgb:avg.map(clampC), a:stops[0].a } };
        }
        case 'pattFill': return { color: colorOf(kid(f, 'fgClr'), ctx, phClr) };
        case 'blipFill': return { blip:f };
        case 'grpFill': return ctx.grpFill || null;
      }
    }
    return null;
  }
  function styleRef(style, name){ const r = kid(style, name); return r ? { idx:num(attr(r, 'idx'), 0), el:r } : null; }
  function themeFill(ctx, ref){
    if(!ref || !ref.idx) return { none:true };
    const phClr = colorOf(ref.el, ctx);
    const lst = ref.idx >= 1000 ? ctx.theme.bgFills : ctx.theme.fills, f = lst[(ref.idx >= 1000 ? ref.idx - 1000 : ref.idx) - 1];
    const wrap = f ? { children:[f] } : null;
    return (wrap && fillOf(wrap, ctx, phClr)) || (phClr ? { color:phClr } : { none:true });
  }
  function lineOf(ln, ctx, style){
    const ref = styleRef(style, 'lnRef'), refClr = ref && ref.idx ? colorOf(ref.el, ctx) : null;
    const themeLn = ref && ref.idx ? ctx.theme.lines[ref.idx - 1] : null;
    let color = null, none = false;
    const f = fillOf(ln, ctx, refClr);
    if(f){ if(f.none) none = true; else color = f.color; }
    else if(refClr){ const tf = themeLn && fillOf(themeLn, ctx, refClr); color = tf && !tf.none ? tf.color : refClr; }
    if(none || !color) return null;
    const w = num(attr(ln, 'w'), num(attr(themeLn, 'w'), 9525)) / EMU;
    const dash = attr(at(ln, 'prstDash'), 'val');
    return { color, w:Math.max(w, 0.25), dash };
  }

  /* ---------- Geometry: every shape becomes a path in its own box, then is placed ---------- */
  function presetPath(prst, w, h, av){
    let text = null;   // the text rectangle inside the shape, as [l, t, r, b]
    const P = [], M = (x,y) => P.push(['M',x,y]), L = (x,y) => P.push(['L',x,y]), C = (a,b,c,d,e,f) => P.push(['C',a,b,c,d,e,f]), Z = () => P.push(['Z']);
    const poly = pts => { pts.forEach(([x,y], i) => i ? L(x,y) : M(x,y)); Z(); };
    const ss = Math.min(w, h), adj = (n, d) => num(av[n], d) / 100000;
    const ellipse = (x, y, rw, rh) => { const k = 0.5523, cx = x + rw, cy = y + rh;
      M(cx + rw, cy); C(cx + rw, cy + rh*k, cx + rw*k, cy + rh, cx, cy + rh); C(cx - rw*k, cy + rh, cx - rw, cy + rh*k, cx - rw, cy);
      C(cx - rw, cy - rh*k, cx - rw*k, cy - rh, cx, cy - rh); C(cx + rw*k, cy - rh, cx + rw, cy - rh*k, cx + rw, cy); Z(); };
    switch(prst){
      case 'ellipse': case 'flowChartConnector': case 'donut': ellipse(0, 0, w/2, h/2); text = [w*0.1464, h*0.1464, w*0.8536, h*0.8536]; break;
      case 'roundRect': case 'flowChartAlternateProcess': case 'round2SameRect': case 'round1Rect': {
        const r = Math.min(ss * adj('adj', 16667), w/2, h/2), k = 0.5523 * r;
        M(r, 0); L(w - r, 0); C(w - r + k, 0, w, r - k, w, r); L(w, h - r); C(w, h - r + k, w - r + k, h, w - r, h);
        L(r, h); C(r - k, h, 0, h - r + k, 0, h - r); L(0, r); C(0, r - k, r - k, 0, r, 0); Z(); text = [r*0.2929, r*0.2929, w - r*0.2929, h - r*0.2929]; break; }
      case 'triangle': case 'flowChartExtract': { const x = w * adj('adj', 50000); poly([[x,0],[w,h],[0,h]]); text = [x/2, h/2, (x + w)/2, h]; break; }
      case 'rtTriangle': poly([[0,0],[w,h],[0,h]]); break;
      case 'diamond': case 'flowChartDecision': poly([[w/2,0],[w,h/2],[w/2,h],[0,h/2]]); text = [w/4, h/4, w*3/4, h*3/4]; break;
      case 'parallelogram': case 'flowChartInputOutput': { const x = ss * adj('adj', 25000); poly([[x,0],[w,0],[w-x,h],[0,h]]); break; }
      case 'trapezoid': { const x = ss * adj('adj', 25000); poly([[x,0],[w-x,0],[w,h],[0,h]]); break; }
      case 'pentagon': case 'homePlate': { const x = w - ss * adj('adj', 50000); poly([[0,0],[x,0],[w,h/2],[x,h],[0,h]]); text = [0, 0, (x + w)/2, h]; break; }
      case 'chevron': { const x = ss * adj('adj', 50000); poly([[0,0],[w-x,0],[w,h/2],[w-x,h],[0,h],[x,h/2]]); text = [x, 0, w - x, h]; break; }
      case 'hexagon': { const x = ss * adj('adj', 25000); poly([[x,0],[w-x,0],[w,h/2],[w-x,h],[x,h],[0,h/2]]); break; }
      case 'octagon': { const x = ss * adj('adj', 29289); poly([[x,0],[w-x,0],[w,x],[w,h-x],[w-x,h],[x,h],[0,h-x],[0,x]]); break; }
      case 'plus': { const x = ss * adj('adj', 25000); poly([[x,0],[w-x,0],[w-x,x],[w,x],[w,h-x],[w-x,h-x],[w-x,h],[x,h],[x,h-x],[0,h-x],[0,x],[x,x]]); break; }
      case 'rightArrow': { const t = h * adj('adj1', 50000), hd = ss * adj('adj2', 50000), y0 = (h - t)/2;
        poly([[0,y0],[w-hd,y0],[w-hd,0],[w,h/2],[w-hd,h],[w-hd,h-y0],[0,h-y0]]); text = [0, y0, w - hd/2, h - y0]; break; }
      case 'leftArrow': { const t = h * adj('adj1', 50000), hd = ss * adj('adj2', 50000), y0 = (h - t)/2;
        poly([[w,y0],[hd,y0],[hd,0],[0,h/2],[hd,h],[hd,h-y0],[w,h-y0]]); text = [hd/2, y0, w, h - y0]; break; }
      case 'upArrow': { const t = w * adj('adj1', 50000), hd = ss * adj('adj2', 50000), x0 = (w - t)/2;
        poly([[x0,h],[x0,hd],[0,hd],[w/2,0],[w,hd],[w-x0,hd],[w-x0,h]]); break; }
      case 'downArrow': { const t = w * adj('adj1', 50000), hd = ss * adj('adj2', 50000), x0 = (w - t)/2;
        poly([[x0,0],[x0,h-hd],[0,h-hd],[w/2,h],[w,h-hd],[w-x0,h-hd],[w-x0,0]]); break; }
      case 'line': case 'straightConnector1': M(0,0); L(w,h); break;
      case 'bentConnector2': M(0,0); L(w,0); L(w,h); break;
      case 'bentConnector3': { const x = w * adj('adj1', 50000); M(0,0); L(x,0); L(x,h); L(w,h); break; }
      case 'curvedConnector3': { const x = w * adj('adj1', 50000); M(0,0); C(x,0,x,h,w,h); break; }
      default: poly([[0,0],[w,0],[w,h],[0,h]]);
    }
    return { paths:[{ d:P, fill:true, stroke:true }], text, open:/^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(prst) };
  }
  function customPaths(geom, w, h){
    const out = [];
    for(const p of kids(at(geom, 'pathLst'), 'path')){
      const pw = num(attr(p, 'w'), 0) || w, ph = num(attr(p, 'h'), 0) || h, sx = w / pw, sy = h / ph, d = [];
      const pt = e => [num(attr(e, 'x'), 0) * sx, num(attr(e, 'y'), 0) * sy];
      let cur = [0,0], start = [0,0];
      for(const c of p.children){
        const pts = kids(c, 'pt').map(pt);
        if(c.localName === 'moveTo'){ cur = start = pts[0]; d.push(['M', ...cur]); }
        else if(c.localName === 'lnTo'){ cur = pts[0]; d.push(['L', ...cur]); }
        else if(c.localName === 'cubicBezTo'){ d.push(['C', ...pts[0], ...pts[1], ...pts[2]]); cur = pts[2]; }
        else if(c.localName === 'quadBezTo'){ const [q, e] = pts;
          d.push(['C', cur[0] + 2/3*(q[0]-cur[0]), cur[1] + 2/3*(q[1]-cur[1]), e[0] + 2/3*(q[0]-e[0]), e[1] + 2/3*(q[1]-e[1]), ...e]); cur = e; }
        else if(c.localName === 'arcTo'){
          const wr = num(attr(c, 'wR'), 0) * sx, hr = num(attr(c, 'hR'), 0) * sy, st = num(attr(c, 'stAng'), 0) / 60000 * Math.PI / 180, sw = num(attr(c, 'swAng'), 0) / 60000 * Math.PI / 180;
          const cx = cur[0] - wr * Math.cos(st), cy = cur[1] - hr * Math.sin(st), n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 16)));
          for(let i = 1; i <= n; i++){ const a = st + sw * i / n; cur = [cx + wr * Math.cos(a), cy + hr * Math.sin(a)]; d.push(['L', ...cur]); }
        }
        else if(c.localName === 'close'){ d.push(['Z']); cur = start; }
      }
      out.push({ d, fill:attr(p, 'fill') !== 'none', stroke:attr(p, 'stroke') !== '0' });
    }
    return { paths:out, open:false };
  }
  // Box-local point → page point, applying flips and rotation about the centre
  function placer(b){
    const cx = b.x + b.w/2, cy = b.y + b.h/2, r = (b.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    return (x, y) => {
      if(b.flipH) x = b.w - x; if(b.flipV) y = b.h - y;
      const dx = b.x + x - cx, dy = b.y + y - cy;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    };
  }
  function drawPath(doc, geo, b, fill, line){
    const put = placer(b);
    for(const p of geo.paths){
      const doFill = fill && p.fill && !geo.open, doStroke = line && p.stroke;
      if(!doFill && !doStroke) continue;
      let any = false;
      for(const s of p.d){
        if(s[0] === 'M'){ doc.moveTo(...put(s[1], s[2])); any = true; }
        else if(s[0] === 'L') doc.lineTo(...put(s[1], s[2]));
        else if(s[0] === 'C') doc.curveTo(...put(s[1], s[2]), ...put(s[3], s[4]), ...put(s[5], s[6]));
        else if(s[0] === 'Z') doc.close();
      }
      if(!any) continue;
      withAlpha(doc, doFill ? fill.a : 1, doStroke ? line.color.a : 1, () => {
        if(doFill) doc.setFillColor(...fill.rgb);
        if(doStroke){ doc.setDrawColor(...line.color.rgb); doc.setLineWidth(line.w); setDash(doc, line); }
        if(doFill && doStroke) doc.fillStroke(); else if(doFill) doc.fill(); else doc.stroke();
        if(doStroke && line.dash && line.dash !== 'solid') doc.setLineDashPattern([], 0);
      });
    }
  }
  function setDash(doc, line){
    const w = line.w, map = { dash:[4,3], sysDash:[3,1], dot:[1,1], sysDot:[1,1], lgDash:[8,3], dashDot:[4,3,1,3], lgDashDot:[8,3,1,3], sysDashDot:[3,1,1,1] };
    const p = map[line.dash]; if(p) doc.setLineDashPattern(p.map(x => x * w), 0);
  }
  function withAlpha(doc, fa, sa, fn){
    if(fa >= 0.999 && sa >= 0.999){ fn(); return; }
    doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity:fa, 'stroke-opacity':sa })); fn(); doc.restoreGraphicsState();
  }

  /* ---------- Pictures ---------- */
  const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', bmp:'image/bmp', webp:'image/webp', svg:'image/svg+xml', tif:'image/tiff', tiff:'image/tiff' };
  async function loadImage(ctx, path, crop){
    const key = path + '|' + (crop || []).join(',');
    if(ctx.images.has(key)) return ctx.images.get(key);
    // jsPDF reuses any image whose alias it has seen before, so every distinct picture in the
    // whole presentation needs its own alias (the map is shared by all slides)
    const alias = 'pptx-img-' + ctx.images.size;
    const job = (async () => {
      const bytes = await ctx.zip.bytes(path); if(!bytes) return null;
      const ext = path.split('.').pop().toLowerCase(), type = MIME[ext]; if(!type) return null;
      const isJpg = type === 'image/jpeg';
      const noCrop = !crop || crop.every(v => !v);
      if(isJpg && noCrop) return { data:bytes, fmt:'JPEG' };
      let bmp;
      try{ bmp = await createImageBitmap(new Blob([bytes], { type })); }
      catch(e){
        if(type !== 'image/svg+xml') return null;
        bmp = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = URL.createObjectURL(new Blob([bytes], { type })); });
        if(!bmp) return null;
      }
      const [l, t, r, b] = (crop || [0,0,0,0]).map(v => v / 100000);
      const sw = bmp.width * (1 - l - r), sh = bmp.height * (1 - t - b); if(sw <= 0 || sh <= 0) return null;
      const k = Math.min(1, 2400 / Math.max(sw, sh)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
      const g = cv.getContext('2d');
      if(isJpg) { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); }
      g.drawImage(bmp, bmp.width * l, bmp.height * t, sw, sh, 0, 0, cv.width, cv.height);
      if(bmp.close) bmp.close();
      return isJpg ? { data:cv.toDataURL('image/jpeg', 0.92), fmt:'JPEG' } : { data:cv.toDataURL('image/png'), fmt:'PNG' };
    })().then(r => r && { ...r, alias }).catch(() => null);
    ctx.images.set(key, job); return job;
  }
  async function drawBlip(doc, ctx, blipFill, rels, b){
    const blip = kid(blipFill, 'blip'), id = rid(blip, 'embed'), rel = id && rels[id];
    if(!rel || rel.external){ if(rid(blip, 'link')) ctx.skipped.images++; return; }
    const src = at(blipFill, 'srcRect'), crop = src ? ['l','t','r','b'].map(k => num(attr(src, k), 0)) : null;
    const img = await loadImage(ctx, rel.target, crop);
    if(!img){ ctx.skipped.images++; return; }
    const alpha = kids(blip, 'alphaModFix')[0], a = alpha ? num(attr(alpha, 'amt'), 100000) / 100000 : 1;
    withAlpha(doc, a, 1, () => {
      try{ doc.addImage(img.data, img.fmt, b.x, b.y, Math.max(b.w, 0.1), Math.max(b.h, 0.1), img.alias, 'FAST', -(b.rot || 0)); }
      catch(e){ ctx.skipped.images++; }
    });
  }

  /* ---------- Text ---------- */
  function pdfFont(face, ctx){
    if(face && face.startsWith('+mj')) face = ctx.theme.major; else if(face && face.startsWith('+mn')) face = ctx.theme.minor;
    const f = (face || '').toLowerCase();
    if(/courier|consol|mono|lucida console|menlo|monaco/.test(f)) return 'courier';
    if(/times|georgia|garamond|cambria|book antiqua|palatino|minion|baskerville|didot|bodoni|constantia|century schoolbook|bookman|serif$|^serif|literata|merriweather|playfair/.test(f) && !/sans/.test(f)) return 'times';
    return 'helvetica';
  }
  // Paragraph and run settings come from the run, the paragraph, then each list style from most to least specific
  function textChain(levelLists, lvl){
    return levelLists.map(ls => ls && (kid(ls, `lvl${lvl + 1}pPr`) || (ls.localName === 'defaultTextStyle' ? kid(ls, 'defPPr') : null))).filter(Boolean);
  }
  // own: the run, its paragraph and the shape's own list style; inh: layout, master and presentation styles.
  // A shape's theme font color sits between the two, as in PowerPoint.
  function runStyle(own, inh, ctx, sh, scale){
    const rPrs = [...own, ...inh];
    const pick = a => first(rPrs, r => attr(r, a));
    const fillOfList = list => { const el = first(list, r => kid(r, 'solidFill') || kid(r, 'gradFill')); return el ? (fillOf({ children:[el] }, ctx) || {}).color : null; };
    const link = !!kid(own[0], 'hlinkClick');
    let color = fillOfList(own) || (link ? { rgb:hex2rgb(ctx.theme.colors.hlink || '0563C1'), a:1 } : null) || sh.fontColor || fillOfList(inh)
      || { rgb:hex2rgb(ctx.theme.colors[ctx.clrMap.tx1 || 'dk1'] || '000000'), a:1 };
    const face = first(rPrs, r => attr(kid(r, 'latin'), 'typeface'));
    const b = pick('b'), i = pick('i'), base = num(pick('baseline'), 0);
    let size = num(pick('sz'), 1800) / 100 * scale;
    if(base) size *= 0.66;
    const bold = sh.boldAll || b === '1' || b === 'true', ital = i === '1' || i === 'true';
    return { font:pdfFont(face, ctx), style:bold && ital ? 'bolditalic' : bold ? 'bold' : ital ? 'italic' : 'normal', size, color,
      u:link || (pick('u') || 'none') !== 'none', caps:pick('cap'), base, sym:!!face && /^(wingdings|symbol|webdings)/i.test(face) };
  }
  const ROMAN = n => { let s = '', v = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]; for(const [k, r] of v) while(n >= k){ s += r; n -= k; } return s; };
  function autoNum(type, n){
    const alpha = k => { let s = ''; while(k > 0){ k--; s = String.fromCharCode(97 + k % 26) + s; k = Math.floor(k / 26); } return s; };
    const m = /^(arabic|alphaLc|alphaUc|romanLc|romanUc)(.*)$/.exec(type || 'arabicPeriod') || [0, 'arabic', 'Period'];
    let v = m[1] === 'arabic' ? String(n) : m[1] === 'alphaLc' ? alpha(n) : m[1] === 'alphaUc' ? alpha(n).toUpperCase() : m[1] === 'romanLc' ? ROMAN(n) : ROMAN(n).toUpperCase();
    return m[2] === 'ParenR' ? v + ')' : m[2] === 'ParenBoth' ? '(' + v + ')' : m[2] === 'Plain' ? v : v + '.';
  }
  function measure(doc, st, s){
    let w = 0;
    for(const p of encodePieces(s)){ if(p.sym){ w += symWidth(p.enc) * st.size; continue; } doc.setFont(st.font, st.style); w += doc.getStringUnitWidth(p.raw) * st.size; }
    return w;
  }
  function drawString(doc, st, s, x, y, rot, put){
    let cx = x;
    for(const p of encodePieces(s)){
      doc.setFont(p.sym ? 'symbol' : st.font, p.sym ? 'normal' : st.style); doc.setFontSize(st.size); doc.setTextColor(...st.color.rgb);
      const w = (p.sym ? symWidth(p.enc) : doc.getStringUnitWidth(p.raw)) * st.size;
      if(p.enc.trim()){
        const [px, py] = put(cx, y);
        doc.text(p.enc, px, py, rot ? { angle:-rot } : undefined);
      }
      cx += w;
    }
    return cx - x;
  }

  // sh: { txBody, box, ownList, lists (inherited list styles, most specific first), bodyPrs, fontColor, boldAll }
  function drawText(doc, ctx, sh){
    const { txBody, box } = sh; if(!txBody) return;
    const paras = kids(txBody, 'p'); if(!paras.length) return;
    const bp = k => first(sh.bodyPrs, b => attr(b, k));
    const ins = (k, d) => num(bp(k), d) / EMU;
    const lI = ins('lIns', 91440), rI = ins('rIns', 91440), tI = ins('tIns', 45720), bI = ins('bIns', 45720);
    const own = sh.bodyPrs[0], fit = kid(own, 'normAutofit');
    const scale = fit ? num(attr(fit, 'fontScale'), 100000) / 100000 : 1, lnRed = fit ? num(attr(fit, 'lnSpcReduction'), 0) / 100000 : 0;
    const wrap = bp('wrap') !== 'none', anchor = bp('anchor') || 't';
    const vert = bp('vert');
    let b = box;
    if(vert === 'vert' || vert === 'eaVert' || vert === 'vert270') b = { ...box, rot:(box.rot || 0) + (vert === 'vert270' ? 270 : 90), x:box.x + box.w/2 - box.h/2, y:box.y + box.h/2 - box.w/2, w:box.h, h:box.w };
    const innerW = Math.max(4, b.w - lI - rI);
    const counters = [];
    const lines = []; let y = 0;

    paras.forEach((p, pi) => {
      const pPr = kid(p, 'pPr'), lvl = Math.min(8, num(attr(pPr, 'lvl'), 0));
      const ownChain = [pPr, ...textChain([sh.ownList], lvl)].filter(Boolean), inhChain = textChain(sh.lists, lvl);
      const chain = [...ownChain, ...inhChain];
      const pa = k => first(chain, e => attr(e, k));
      const pc = k => first(chain, e => kid(e, k));
      const algn = pa('algn') || 'l', marL = num(pa('marL'), 0) / EMU, indent = num(pa('indent'), 0) / EMU;
      const defOwn = ownChain.map(e => kid(e, 'defRPr')).filter(Boolean), defInh = inhChain.map(e => kid(e, 'defRPr')).filter(Boolean);
      const style = rPr => runStyle([rPr, ...defOwn].filter(Boolean), defInh, ctx, sh, scale);

      // Runs → words
      const toks = []; let firstStyle = null;
      for(const r of p.children){
        if(r.localName === 'r' || r.localName === 'fld'){
          const st = style(kid(r, 'rPr'));
          let t = kid(r, 't')?.textContent || '';
          if(r.localName === 'fld' && /slidenum/i.test(attr(r, 'type') || '')) t = String(ctx.slideNo);
          if(st.caps === 'all') t = t.toUpperCase();
          t = t.replace(/\t/g, '    ').replace(/[\u000B\r\n]/g, ' ');
          if(st.sym) t = t.replace(/[^\s]/g, '•');
          if(!firstStyle) firstStyle = st;
          for(const w of t.split(/(\s+)/)) if(w) toks.push({ s:w, st, sp:/^\s+$/.test(w) });
        } else if(r.localName === 'br'){
          toks.push({ br:true, st:style(kid(r, 'rPr')) });
        }
      }
      const endSt = style(kid(p, 'endParaRPr'));
      const baseSt = firstStyle || endSt;

      // Bullet
      let bullet = null;
      const hasText = toks.some(t => !t.br && !t.sp);
      const buEl = first(chain, e => kid(e, 'buNone') || kid(e, 'buChar') || kid(e, 'buAutoNum') || kid(e, 'buBlip'));
      if(hasText && buEl && buEl.localName !== 'buNone'){
        const clrEl = pc('buClr'), szEl = pc('buSzPct'), szPts = pc('buSzPts'), fontEl = pc('buFont');
        const size = szPts ? num(attr(szPts, 'val'), 1200) / 100 * scale : baseSt.size * (szEl ? num(attr(szEl, 'val'), 100000) / 100000 : 1);
        const color = clrEl ? colorOf(clrEl, ctx) || baseSt.color : baseSt.color;
        let ch;
        if(buEl.localName === 'buAutoNum'){
          for(let k = lvl + 1; k < counters.length; k++) counters[k] = 0;
          counters[lvl] = (counters[lvl] || num(attr(buEl, 'startAt'), 1) - 1) + 1;
          ch = autoNum(attr(buEl, 'type'), counters[lvl]);
        } else {
          ch = attr(buEl, 'char') || '•';
          const face = attr(fontEl, 'typeface') || '';
          if(/wingdings|symbol|webdings|marlett/i.test(face) || !winChar(ch[0]) && SYM[ch.codePointAt(0)] == null) ch = /[Øü]/.test(ch) ? '›' : '•';
        }
        bullet = { ch, st:{ ...baseSt, size, color, u:false, base:0 } };
      }
      if(!(bullet && buEl.localName === 'buAutoNum')) counters[lvl] = 0;

      // Spacing
      const spc = (el, sz) => { if(!el) return 0; const pts = kid(el, 'spcPts'), pct = kid(el, 'spcPct');
        return pts ? num(attr(pts, 'val'), 0) / 100 : pct ? num(attr(pct, 'val'), 0) / 100000 * sz * 1.2 : 0; };
      const lnEl = pc('lnSpc');
      const lineH = sz => { const pts = kid(lnEl, 'spcPts'), pct = kid(lnEl, 'spcPct');
        if(pts) return num(attr(pts, 'val'), 0) / 100;
        return sz * 1.2 * (pct ? num(attr(pct, 'val'), 100000) / 100000 : 1) * (1 - lnRed); };
      if(pi > 0) y += spc(pc('spcBef'), baseSt.size);

      // Wrap words into lines
      const firstX = bullet ? marL : marL + indent;
      let cur = { items:[], w:0, x:firstX, first:true };
      const avail = l => Math.max(8, innerW - l.x);
      const pushLine = () => { lines.push({ ...cur, algn, para:p, bullet:cur.first ? bullet : null, marL, indent }); cur = { items:[], w:0, x:marL, first:false }; };
      for(const t of toks){
        if(t.br){ cur.brSt = t.st; pushLine(); continue; }
        const tw = measure(doc, t.st, t.s);
        if(t.sp && !cur.items.length && !cur.first) continue;
        if(wrap && !t.sp && cur.items.length && cur.w + tw > avail(cur)) pushLine();
        if(wrap && !t.sp && tw > avail(cur)){
          // A single word wider than the box is split by characters
          let part = '';
          for(const c of t.s){ const w2 = measure(doc, t.st, part + c); if(w2 > avail(cur) && part){ cur.items.push({ s:part, st:t.st, w:measure(doc, t.st, part) }); cur.w += cur.items.at(-1).w; pushLine(); part = c; } else part += c; }
          if(part){ const w2 = measure(doc, t.st, part); cur.items.push({ s:part, st:t.st, w:w2 }); cur.w += w2; }
          continue;
        }
        cur.items.push({ s:t.s, st:t.st, w:tw, sp:t.sp }); cur.w += tw;
      }
      pushLine();
      // Line heights for this paragraph's lines
      const mine = lines.filter(l => l.para === p);
      for(const l of mine){
        const sz = Math.max(...l.items.filter(i => !i.sp).map(i => i.st.size), l.items.length ? 0 : (l.brSt || endSt).size, l.bullet ? l.bullet.st.size * 0.8 : 0) || endSt.size;
        l.size = sz; l.top = y; l.h = lineH(sz); y += l.h;
      }
      y += spc(pc('spcAft'), baseSt.size);
    });

    const total = y, innerH = b.h - tI - bI;
    const y0 = b.y + tI + (anchor === 'ctr' ? (innerH - total) / 2 : anchor === 'b' ? innerH - total : 0);
    const rot = b.rot || 0, put = rot ? placer(b) : null;
    const toPage = (x, yy) => put ? put(x - b.x, yy - b.y) : [x, yy];
    for(const l of lines){
      // Trailing spaces never count towards alignment
      let n = l.items.length; while(n && l.items[n - 1].sp) n--;
      const items = l.items.slice(0, n), lw = items.reduce((s, i) => s + i.w, 0);
      const base = y0 + l.top + l.h - l.size * 0.25;
      const left = b.x + lI + l.x, room = innerW - l.x;
      let x = algn(l.algn) === 'ctr' ? left + (room - lw) / 2 : algn(l.algn) === 'r' ? left + room - lw : left;
      if(l.bullet){
        const bx = b.x + lI + l.marL + l.indent;
        drawString(doc, l.bullet.st, l.bullet.ch, bx, base, rot, toPage);
        if(algn(l.algn) === 'l' && l.indent >= 0) x = Math.max(x, bx + measure(doc, l.bullet.st, l.bullet.ch + ' '));
      }
      // Join neighbouring words that share a style, so the PDF holds whole phrases
      let i = 0;
      while(i < items.length){
        let j = i, s = '', w = 0; const st = items[i].st;
        while(j < items.length && items[j].st === st){ s += items[j].s; w += items[j].w; j++; }
        const yb = st.base > 0 ? base - l.size * 0.33 : st.base < 0 ? base + l.size * 0.12 : base;
        drawString(doc, st, s, x, yb, rot, toPage);
        if(st.u && !rot){ doc.setDrawColor(...st.color.rgb); doc.setLineWidth(Math.max(0.5, st.size * 0.06)); doc.line(x, yb + st.size * 0.12, x + w, yb + st.size * 0.12); }
        x += w; i = j;
      }
    }
    function algn(a){ return a === 'ctr' ? 'ctr' : a === 'r' ? 'r' : 'l'; }
  }

  /* ---------- Placeholders: find the matching shape on the layout and master ---------- */
  function phOf(sp){ const nv = [...sp.children].find(c => /^nv/.test(c.localName)); const ph = at(nv, 'nvPr', 'ph'); return ph ? { type:attr(ph, 'type') || 'obj', idx:attr(ph, 'idx'), el:ph } : null; }
  function findPh(tree, ph, master){
    if(!tree || !ph) return null;
    const all = [];
    (function walk(t){ for(const c of t.children){ if(c.localName === 'grpSp') walk(c); else { const p = phOf(c); if(p) all.push({ sp:c, ph:p }); } } })(tree);
    const norm = t => master ? (t === 'ctrTitle' ? 'title' : /^(obj|subTitle|body|tbl|chart|dgm|media|clipArt|pic)$/.test(t) ? 'body' : t) : t;
    if(!master && ph.idx != null){ const m = all.find(c => c.ph.idx === ph.idx); if(m) return m.sp; }
    const want = norm(ph.type);
    return (all.find(c => norm(c.ph.type) === want) || (!master && ph.type === 'obj' ? all.find(c => c.ph.type === 'body') : null) ||
      (/title/i.test(ph.type) ? all.find(c => /title/i.test(c.ph.type)) : null))?.sp || null;
  }
  function styleListFor(ph, ctx){
    const tx = ctx.masterXml && at(ctx.masterXml, 'txStyles');
    if(!ph) return [kid(tx, 'otherStyle'), ctx.presDefault];
    if(/^(title|ctrTitle)$/.test(ph.type)) return [kid(tx, 'titleStyle')];
    if(/^(dt|ftr|sldNum|hdr)$/.test(ph.type)) return [kid(tx, 'otherStyle'), ctx.presDefault];
    return [kid(tx, 'bodyStyle')];
  }

  /* ---------- Drawing a shape tree ---------- */
  const xfrmBox = (xfrm, T) => {
    const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext'); if(!off || !ext) return null;
    const x = num(attr(off, 'x'), 0), y = num(attr(off, 'y'), 0), w = num(attr(ext, 'cx'), 0), h = num(attr(ext, 'cy'), 0);
    return { x:T.sx * x + T.tx, y:T.sy * y + T.ty, w:T.sx * w, h:T.sy * h, rot:num(attr(xfrm, 'rot'), 0) / 60000,
      flipH:attr(xfrm, 'flipH') === '1', flipV:attr(xfrm, 'flipV') === '1' };
  };
  async function drawTree(doc, ctx, tree, part, T){
    for(let el of tree.children){
      if(el.localName === 'AlternateContent') el = (kid(el, 'Fallback') || kid(el, 'Choice'))?.firstElementChild; if(!el) continue;
      const nv = [...el.children].find(c => /^nv/.test(c.localName)), cNv = nv && nv.firstElementChild;
      if(cNv && attr(cNv, 'hidden') === '1') continue;
      try{
        switch(el.localName){
          case 'sp': case 'cxnSp': await drawSp(doc, ctx, el, part, T); break;
          case 'pic': await drawPic(doc, ctx, el, part, T); break;
          case 'grpSp': {
            const gp = kid(el, 'grpSpPr'), x = kid(gp, 'xfrm');
            let T2 = T;
            if(x && kid(x, 'off') && kid(x, 'chOff')){
              const off = kid(x, 'off'), ext = kid(x, 'ext'), cOff = kid(x, 'chOff'), cExt = kid(x, 'chExt');
              const sx = num(attr(ext, 'cx'), 1) / (num(attr(cExt, 'cx'), 0) || num(attr(ext, 'cx'), 1)), sy = num(attr(ext, 'cy'), 1) / (num(attr(cExt, 'cy'), 0) || num(attr(ext, 'cy'), 1));
              T2 = { sx:T.sx * sx, sy:T.sy * sy, tx:T.sx * (num(attr(off, 'x'), 0) - num(attr(cOff, 'x'), 0) * sx) + T.tx, ty:T.sy * (num(attr(off, 'y'), 0) - num(attr(cOff, 'y'), 0) * sy) + T.ty };
            }
            const prevGrp = ctx.grpFill; const gf = fillOf(gp, ctx); if(gf) ctx.grpFill = gf;
            await drawTree(doc, ctx, el, part, T2); ctx.grpFill = prevGrp; break;
          }
          case 'graphicFrame': await drawFrame(doc, ctx, el, part, T); break;
          case 'contentPart': break;
        }
      }catch(e){ ctx.skipped.other++; }
    }
  }
  async function drawSp(doc, ctx, sp, part, T){
    const ph = phOf(sp);
    if(ph && part.template) return;   // layout/master placeholders are prompts, not content
    const spPr = kid(sp, 'spPr'), style = kid(sp, 'style');
    const lPh = ph && part.kind === 'slide' ? findPh(ctx.layoutTree, ph, false) : null;
    const mPh = ph ? findPh(ctx.masterTree, ph, true) : null;
    const chainSp = [sp, lPh, mPh].filter(Boolean);
    const xfrm = first(chainSp, s => kid(kid(s, 'spPr'), 'xfrm'));
    let b = xfrm && xfrmBox(xfrm, T);
    const txBody = kid(sp, 'txBody');
    if(!b) return;
    const geomOwner = first(chainSp, s => { const p = kid(s, 'spPr'); return kid(p, 'prstGeom') || kid(p, 'custGeom'); });
    const geo = geomOwner?.localName === 'custGeom' ? customPaths(geomOwner, b.w, b.h)
      : presetPath(attr(geomOwner, 'prst') || 'rect', b.w, b.h, Object.fromEntries(kids(at(geomOwner, 'avLst'), 'gd').map(g => [attr(g, 'name'), (attr(g, 'fmla') || '').replace(/^val\s+/, '')])));
    let fill = first(chainSp, s => fillOf(kid(s, 'spPr'), ctx));
    if(!fill && style) fill = themeFill(ctx, styleRef(style, 'fillRef'));
    const ln = first(chainSp, s => kid(kid(s, 'spPr'), 'ln'));
    const line = lineOf(ln, ctx, style);
    if(fill && fill.blip){ await drawBlip(doc, ctx, fill.blip, part.rels, b); fill = null; }
    if((fill && fill.color) || line) drawPath(doc, geo, b, fill && fill.color, line);

    if(txBody){
      // SmartArt drawings carry their own text box
      const tx = kid(sp, 'txXfrm'); let tb = tx ? xfrmBox(tx, T) : b;
      if(!tx && geo.text){
        const [l, t, r, bt] = geo.text, [cx, cy] = placer(b)((l + r) / 2, (t + bt) / 2);
        tb = { x:cx - (r - l) / 2, y:cy - (bt - t) / 2, w:r - l, h:bt - t, rot:b.rot };
      }
      const fontRef = style && kid(style, 'fontRef');
      const lists = [lPh && at(lPh, 'txBody', 'lstStyle'), mPh && at(mPh, 'txBody', 'lstStyle'), ...styleListFor(ph, ctx)];
      drawText(doc, ctx, { txBody, box:{ ...tb, rot:tb.rot || 0, flipH:false, flipV:false }, ownList:kid(txBody, 'lstStyle'), lists:lists.filter(Boolean),
        bodyPrs:[kid(txBody, 'bodyPr'), lPh && at(lPh, 'txBody', 'bodyPr'), mPh && at(mPh, 'txBody', 'bodyPr')].filter(Boolean),
        fontColor:fontRef ? colorOf(fontRef, ctx) : null });
    }
  }
  async function drawPic(doc, ctx, pic, part, T){
    const ph = phOf(pic);
    const lPh = ph && part.kind === 'slide' ? findPh(ctx.layoutTree, ph, false) : null;
    const xfrm = kid(kid(pic, 'spPr'), 'xfrm') || (lPh && kid(kid(lPh, 'spPr'), 'xfrm'));
    const b = xfrm && xfrmBox(xfrm, T); if(!b) return;
    await drawBlip(doc, ctx, kid(pic, 'blipFill'), part.rels, b);
    const line = lineOf(kid(kid(pic, 'spPr'), 'ln'), ctx, kid(pic, 'style'));
    if(line) drawPath(doc, presetPath('rect', b.w, b.h, {}), b, null, line);
  }
  async function drawFrame(doc, ctx, fr, part, T){
    const b = xfrmBox(kid(fr, 'xfrm'), T); if(!b) return;
    const data = at(fr, 'graphic', 'graphicData'), uri = attr(data, 'uri') || '';
    if(/table/.test(uri)) return drawTable(doc, ctx, kid(data, 'tbl'), b);
    if(/diagram/.test(uri)){
      // SmartArt: PowerPoint saves a ready-made drawing of it next to the slide
      const ids = kid(data, 'relIds'), dm = rid(ids, 'dm'), dmRel = dm && part.rels[dm];
      let drawingPath = null;
      if(dmRel){ const x = await ctx.zip.text(dmRel.target); const m = x && /dataModelExt[^>]*relId="([^"]+)"/.exec(x); if(m && part.rels[m[1]]) drawingPath = part.rels[m[1]].target; }
      if(drawingPath){
        const xml = parseXml(await ctx.zip.text(drawingPath)), tree = at(xml, 'spTree') || [...xml.getElementsByTagName('*')].find(e => e.localName === 'spTree');
        if(tree){ const rels = await loadRels(ctx.zip, drawingPath);
          await drawTree(doc, ctx, tree, { ...part, rels }, { sx:T.sx, sy:T.sy, tx:b.x, ty:b.y }); return; }
      }
      ctx.skipped.diagrams++; return;
    }
    if(/chart/.test(uri)){ ctx.skipped.charts++; return; }
    // OLE objects and similar keep a preview picture
    const pic = [...fr.getElementsByTagName('*')].find(e => e.localName === 'pic');
    if(pic){ await drawBlip(doc, ctx, kid(pic, 'blipFill'), part.rels, b); return; }
    ctx.skipped.other++;
  }
  function drawTable(doc, ctx, tbl, b){
    if(!tbl) return;
    const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map(c => num(attr(c, 'w'), 0) / EMU);
    const rows = kids(tbl, 'tr'), tp = kid(tbl, 'tblPr');
    const firstRow = attr(tp, 'firstRow') === '1', band = attr(tp, 'bandRow') === '1';
    const accent = { rgb:hex2rgb(ctx.theme.colors.accent1 || '4472C4'), a:1 };
    const tint = (c, k) => ({ rgb:c.rgb.map(x => clampC(255 - (255 - x) * k)), a:1 });
    const sx = b.w / Math.max(1, cols.reduce((s, c) => s + c, 0)) || 1;
    // Row heights grow to fit their text, as in PowerPoint
    const hs = rows.map(r => num(attr(r, 'h'), 0) / EMU);
    let y = b.y;
    rows.forEach((tr, ri) => {
      let x = b.x;
      const cells = kids(tr, 'tc');
      const rowH = Math.max(hs[ri], ...cells.map((tc, ci) => estimateCell(doc, ctx, tc, cols.slice(ci, ci + num(attr(tc, 'gridSpan'), 1)).reduce((s, c) => s + c, 0) * sx)));
      cells.forEach((tc, ci) => {
        const span = num(attr(tc, 'gridSpan'), 1), w = cols.slice(ci, ci + span).reduce((s, c) => s + c, 0) * sx;
        if(attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1'){ x += (cols[ci] || 0) * sx; return; }
        const tcPr = kid(tc, 'tcPr'); let f = fillOf(tcPr, ctx);
        const header = firstRow && ri === 0;
        if(!f) f = header ? { color:accent } : band ? { color:tint(accent, (ri - (firstRow ? 1 : 0)) % 2 ? 0.2 : 0.4) } : null;
        const cb = { x, y, w, h:rowH, rot:0 };
        const borders = ['lnL','lnR','lnT','lnB'].map(k => kid(tcPr, k));
        const anyBorder = borders.some(Boolean);
        if(f && f.color) drawPath(doc, presetPath('rect', w, rowH, {}), cb, f.color, null);
        const edge = [[0,0,0,rowH],[w,0,w,rowH],[0,0,w,0],[0,rowH,w,rowH]];
        borders.forEach((ln, k) => {
          const l = ln ? lineOf(ln, ctx, null) : anyBorder ? null : f ? { color:{ rgb:[255,255,255], a:1 }, w:1 } : { color:{ rgb:[160,166,176], a:1 }, w:0.5 };
          if(!l) return; const [x1, y1, x2, y2] = edge[k];
          doc.setDrawColor(...l.color.rgb); doc.setLineWidth(l.w); doc.line(x + x1, y + y1, x + x2, y + y2);
        });
        const color = header && !(tcPr && fillOf(tcPr, ctx)) ? { rgb:[255,255,255], a:1 } : null;
        drawText(doc, ctx, { txBody:kid(tc, 'txBody'), box:cb, ownList:at(tc, 'txBody', 'lstStyle'), lists:[ctx.presDefault].filter(Boolean),
          bodyPrs:[cellBodyPr(tcPr)], fontColor:color, boldAll:header });
        x += w;
      });
      y += rowH;
    });
  }
  // Table cells keep their insets on tcPr; present them as a bodyPr for drawText
  function cellBodyPr(tcPr){
    const d = document.implementation.createDocument(null, 'bodyPr');
    const bp = d.documentElement;
    const map = { marL:'lIns', marR:'rIns', marT:'tIns', marB:'bIns' };
    for(const [k, v] of Object.entries(map)) bp.setAttribute(v, attr(tcPr, k) ?? { lIns:'91440', rIns:'91440', tIns:'45720', bIns:'45720' }[v]);
    if(attr(tcPr, 'anchor')) bp.setAttribute('anchor', attr(tcPr, 'anchor'));
    return bp;
  }
  function estimateCell(doc, ctx, tc, w){
    let h = 0; const tcPr = kid(tc, 'tcPr');
    for(const p of kids(kid(tc, 'txBody'), 'p')){
      const runs = kids(p, 'r'); const sz = Math.max(...runs.map(r => num(attr(kid(r, 'rPr'), 'sz'), 1800) / 100), num(attr(kid(p, 'endParaRPr'), 'sz'), 1800) / 100);
      const text = runs.map(r => kid(r, 't')?.textContent || '').join('');
      doc.setFont('helvetica', 'normal');
      const inner = Math.max(10, w - (num(attr(tcPr, 'marL'), 91440) + num(attr(tcPr, 'marR'), 91440)) / EMU);
      const lines = Math.max(1, Math.ceil(doc.getStringUnitWidth(text) * sz / inner));
      h += lines * sz * 1.2;
    }
    return h + (num(attr(tcPr, 'marT'), 45720) + num(attr(tcPr, 'marB'), 45720)) / EMU;
  }

  /* ---------- Backgrounds ---------- */
  async function drawBackground(doc, ctx, parts, W, H){
    for(const p of parts){
      const bg = at(p.xml, 'cSld', 'bg'); if(!bg) continue;
      const pr = kid(bg, 'bgPr'), ref = kid(bg, 'bgRef');
      const box = { x:0, y:0, w:W, h:H, rot:0 };
      if(pr){
        const f = fillOf(pr, ctx);
        if(f && f.blip){ doc.setFillColor(255,255,255); doc.rect(0, 0, W, H, 'F'); await drawBlip(doc, ctx, f.blip, p.rels, box); }
        else if(f && f.color) drawPath(doc, presetPath('rect', W, H, {}), box, f.color, null);
        return;
      }
      if(ref){
        const f = themeFill(ctx, { idx:num(attr(ref, 'idx'), 0), el:ref });
        if(f.blip){ await drawBlip(doc, ctx, f.blip, ctx.themeRels, box); return; }
        const c = f.color || colorOf(ref, ctx); if(c) drawPath(doc, presetPath('rect', W, H, {}), box, c, null);
        return;
      }
    }
  }

  /* ---------- Package parts ---------- */
  async function loadRels(zip, path){
    const i = path.lastIndexOf('/'), rp = path.slice(0, i + 1) + '_rels/' + path.slice(i + 1) + '.rels';
    const x = await zip.text(rp), out = {}; if(!x) return out;
    for(const r of kids(parseXml(x), 'Relationship')){
      const ext = attr(r, 'TargetMode') === 'External';
      out[attr(r, 'Id')] = { target:ext ? attr(r, 'Target') : joinPath(path, attr(r, 'Target')), type:attr(r, 'Type') || '', external:ext };
    }
    return out;
  }
  const relOfType = (rels, t) => Object.values(rels).find(r => r.type.endsWith('/' + t));
  async function loadPart(zip, path, kind, cache){
    if(cache.has(path)) return cache.get(path);
    const job = (async () => { const t = await zip.text(path); if(!t) return null; return { path, kind, xml:parseXml(t), rels:await loadRels(zip, path), template:kind !== 'slide' }; })();
    cache.set(path, job); return job;
  }
  async function loadTheme(zip, path){
    const theme = { colors:{}, major:'', minor:'', fills:[], bgFills:[], lines:[] };
    const t = path && await zip.text(path); if(!t) return theme;
    const x = parseXml(t), el = at(x, 'themeElements');
    for(const c of kids(at(el, 'clrScheme'))){ const v = c.firstElementChild; theme.colors[c.localName] = attr(v, 'lastClr') || attr(v, 'val') || '000000'; }
    theme.major = attr(at(el, 'fontScheme', 'majorFont', 'latin'), 'typeface') || '';
    theme.minor = attr(at(el, 'fontScheme', 'minorFont', 'latin'), 'typeface') || '';
    const fmt = at(el, 'fmtScheme');
    theme.fills = kids(kid(fmt, 'fillStyleLst')); theme.bgFills = kids(kid(fmt, 'bgFillStyleLst')); theme.lines = kids(kid(fmt, 'lnStyleLst'));
    return theme;
  }
  const clrMapOf = el => el ? Object.fromEntries([...el.attributes].map(a => [a.localName, a.value])) : null;

  async function isPptx(buf){
    const u = new Uint8Array(buf, 0, 4); if(!(u[0] === 0x50 && u[1] === 0x4B)) return false;
    try{ return (await unzip(buf)).has('ppt/presentation.xml'); }catch(e){ return false; }
  }

  async function toPdf(buf, onProgress){
    if(typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open PowerPoint files. Update it, or save the slides as PDF.');
    const zip = await unzip(buf);
    const presPath = 'ppt/presentation.xml', pres = parseXml(await zip.text(presPath)), presRels = await loadRels(zip, presPath);
    const sz = kid(pres, 'sldSz'), W = num(attr(sz, 'cx'), 9144000) / EMU, H = num(attr(sz, 'cy'), 6858000) / EMU;
    const slideIds = kids(kid(pres, 'sldIdLst'), 'sldId').map(s => presRels[rid(s, 'id')]?.target).filter(Boolean);
    const cache = new Map(), themes = new Map();
    const skipped = { charts:0, diagrams:0, images:0, other:0 };
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:[W, H], orientation:W > H ? 'landscape' : 'portrait', compress:true });
    const images = new Map();
    let pages = 0;
    for(let i = 0; i < slideIds.length; i++){
      const slide = await loadPart(zip, slideIds[i], 'slide', cache); if(!slide) continue;
      if(attr(slide.xml, 'show') === '0') continue;   // hidden slides stay out, as in PowerPoint's own PDF export
      onProgress && onProgress(i + 1, slideIds.length);
      const layoutRel = relOfType(slide.rels, 'slideLayout'), layout = layoutRel && await loadPart(zip, layoutRel.target, 'layout', cache);
      const masterRel = layout && relOfType(layout.rels, 'slideMaster'), master = masterRel && await loadPart(zip, masterRel.target, 'master', cache);
      const themeRel = master && relOfType(master.rels, 'theme');
      if(themeRel && !themes.has(themeRel.target)) themes.set(themeRel.target, await loadTheme(zip, themeRel.target));
      const theme = themes.get(themeRel?.target) || await loadTheme(zip, null);
      const clrMap = clrMapOf(kid(master?.xml, 'clrMap')) || { bg1:'lt1', tx1:'dk1', bg2:'lt2', tx2:'dk2' };
      const over = at(slide.xml, 'clrMapOvr', 'overrideClrMapping') || at(layout?.xml, 'clrMapOvr', 'overrideClrMapping');
      const ctx = { zip, theme, clrMap:clrMapOf(over) || clrMap, images, skipped, slideNo:pages + 1,
        masterXml:master?.xml, masterTree:at(master?.xml, 'cSld', 'spTree'), layoutTree:at(layout?.xml, 'cSld', 'spTree'),
        presDefault:kid(pres, 'defaultTextStyle'), themeRels:themeRel ? await loadRels(zip, themeRel.target) : {} };
      if(pages++) doc.addPage([W, H], W > H ? 'landscape' : 'portrait');
      doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, 'F');
      await drawBackground(doc, ctx, [slide, layout, master].filter(Boolean), W, H);
      const T = { sx:1 / EMU, sy:1 / EMU, tx:0, ty:0 };
      const showMaster = attr(slide.xml, 'showMasterSp') !== '0';
      if(master && showMaster && attr(layout?.xml, 'showMasterSp') !== '0') await drawTree(doc, ctx, ctx.masterTree, master, T);
      if(layout && showMaster) await drawTree(doc, ctx, ctx.layoutTree, layout, T);
      await drawTree(doc, ctx, at(slide.xml, 'cSld', 'spTree'), slide, T);
    }
    if(!pages) throw new Error('This presentation has no slides to show.');
    return { bytes:doc.output('arraybuffer'), pages, skipped };
  }

  return { isPptx, toPdf };
})();
