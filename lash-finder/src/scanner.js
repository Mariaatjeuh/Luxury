// ===================================================================
// AI SCANNER — gezichtsherkenning in de browser (Google MediaPipe)
// De foto wordt NIET verstuurd: alles gebeurt op het toestel van de klant.
// Het model (~4 MB) wordt pas geladen als iemand de scan opent.
// ===================================================================
const LF_SCAN = Object.assign({
  lib:   'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs',
  wasm:  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
}, window.LF_SCAN_CFG || {});

// Drempelwaarden — bijstellen op basis van echte scans (zie ?lfdebug=1)
const LF_T = {
  tiltUp:      9,     // ooghoek-hoek (graden) vanaf hier: opwaarts / cat-eye
  tiltDown:    0,     // tot en met hier: neerhangend
  roundOpen:   0.37,  // hoogte/breedte van het oog vanaf hier: rond
  sizeSmall:   0.185, // oogbreedte / gezichtsbreedte onder deze waarde: klein
  sizeLarge:   0.225, // boven deze waarde: groot
  minFacePx:   160,   // gezicht moet minstens zo breed zijn (pixels)
  maxYaw:      15,    // hoofd max zoveel graden opzij gedraaid
  maxPitch:    22,    // hoofd max zoveel graden omhoog/omlaag
  minOpen:     0.16,  // kleiner = ogen (half) dicht
  maxSquint:   0.65   // blendshape: ogen samengeknepen (lachen)
};

const LF_SCAN_MSG = {
  noface:  'We zien geen gezicht op deze foto. Zorg dat je hele gezicht in beeld is, recht van voren en met goed licht. Een close-up van alleen je oog werkt niet.',
  multi:   'We zien meer dan één gezicht. Gebruik een foto waarop alleen jij staat.',
  small:   'Je gezicht is te klein in beeld. Kom dichter bij de camera, zodat je gezicht een groot deel van de foto vult.',
  yaw:     'Je hoofd is te veel opzij gedraaid. Kijk recht in de camera.',
  pitch:   'Je kijkt te veel omhoog of omlaag. Houd de camera op ooghoogte en kijk recht vooruit.',
  closed:  'Je ogen lijken (half) dicht. Kijk met open ogen recht in de camera.',
  squint:  'Je lacht of knijpt je ogen samen — daardoor lijkt je oogvorm anders. Kijk neutraal in de camera.',
  support: 'De scan werkt niet op dit toestel of in deze browser. Probeer een andere browser, of doe de quiz — die geeft net zo goed een persoonlijk advies.',
  camera:  'We kunnen je camera niet openen. Geef toestemming in je browser, of upload een foto.'
};

let lfImg = null;          // dataURL van de foto (voor preview)
let lfCanvas = null;       // geschaalde foto voor de analyse
let lfStream = null;       // camera stream
let lfLM = null, lfLMPromise = null;
let lfScan = null;         // meetresultaat van de laatste scan
const lfSA = {};           // antwoorden op de vragen na de scan
const LF_DEBUG = /[?&]lfdebug=1/.test(location.search);

function lfShow(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; }

function lfLoadScanner() {
  if (lfLM) return Promise.resolve(lfLM);
  if (!lfLMPromise) {
    lfLMPromise = (async () => {
      const vision = await import(LF_SCAN.lib);
      const files = await vision.FilesetResolver.forVisionTasks(LF_SCAN.wasm);
      lfLM = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: LF_SCAN.model, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      });
      return lfLM;
    })().catch(e => { lfLMPromise = null; throw e; });
  }
  return lfLMPromise;
}

// ---------- foto binnenhalen ----------
function lfSetSource(src) {
  // Schaal naar max 1280px: sneller en genoeg detail voor de ogen
  const max = 1280;
  const w = src.videoWidth || src.naturalWidth || src.width;
  const h = src.videoHeight || src.naturalHeight || src.height;
  const s = Math.min(1, max / Math.max(w, h));
  lfCanvas = document.createElement('canvas');
  lfCanvas.width = Math.round(w * s); lfCanvas.height = Math.round(h * s);
  lfCanvas.getContext('2d').drawImage(src, 0, 0, lfCanvas.width, lfCanvas.height);
  lfImg = lfCanvas.toDataURL('image/jpeg', 0.85);
  document.getElementById('lfPreview').src = lfImg;
  lfShow('lfScanStart', false); lfShow('lfCam', false); lfShow('lfShot', true);
  document.getElementById('lfSCard').classList.remove('show');
  document.getElementById('lfSCard').innerHTML = '';
}

function lfUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { lfSetSource(img); URL.revokeObjectURL(url); };
  img.onerror = () => { URL.revokeObjectURL(url); lfErr('Dit bestand kunnen we niet openen. Gebruik een JPG- of PNG-foto.'); };
  img.src = url;
  lfLoadScanner().catch(() => {});
}

async function lfCamOpen() {
  lfLoadScanner().catch(() => {});
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { lfErr(LF_SCAN_MSG.camera); return; }
  try {
    lfStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    const v = document.getElementById('lfVideo');
    v.srcObject = lfStream;
    await v.play().catch(() => {});
    lfShow('lfScanStart', false); lfShow('lfCam', true);
    document.getElementById('lfSCard').classList.remove('show');
  } catch (e) {
    lfCamStop();
    lfErr(LF_SCAN_MSG.camera);
  }
}

function lfCamStop() {
  if (lfStream) { lfStream.getTracks().forEach(t => t.stop()); lfStream = null; }
  const v = document.getElementById('lfVideo'); if (v) v.srcObject = null;
}

function lfCamShoot() {
  const v = document.getElementById('lfVideo');
  if (!v || !v.videoWidth) return;
  lfSetSource(v);
  lfCamStop();
}

function lfReset() {
  lfCamStop();
  lfImg = null; lfCanvas = null; lfScan = null;
  Object.keys(lfSA).forEach(k => delete lfSA[k]);
  document.getElementById('lfPreview').src = '';
  lfShow('lfScanStart', true); lfShow('lfCam', false); lfShow('lfShot', false); lfShow('lfScanQ', false);
  document.getElementById('lfScanQ').innerHTML = '';
  document.getElementById('lfSLd').classList.remove('show');
  document.getElementById('lfSCard').classList.remove('show');
  document.getElementById('lfSCard').innerHTML = '';
  document.getElementById('lfFileInput').value = '';
  try { sessionStorage.removeItem('lq_result_html'); } catch (e) {}
}

// ---------- meten ----------
// Puur rekenwerk op de 478 gezichtspunten van MediaPipe.
function lfMeasure(res, W, H) {
  const faces = res.faceLandmarks || [];
  if (faces.length === 0) return { ok: false, reason: 'noface' };
  if (faces.length > 1) return { ok: false, reason: 'multi' };
  const L = faces[0];
  const P = i => ({ x: L[i].x * W, y: L[i].y * H });
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Kanteling van het hoofd (roll) wegrekenen: draai alle punten tot de ogen horizontaal liggen
  const rc = mid(P(33), P(133)), lc = mid(P(263), P(362));
  let roll = Math.atan2(lc.y - rc.y, lc.x - rc.x);
  if (roll > Math.PI / 2) roll -= Math.PI; else if (roll < -Math.PI / 2) roll += Math.PI;
  const c = mid(rc, lc), cs = Math.cos(-roll), sn = Math.sin(-roll);
  const Q = i => { const p = P(i), dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs }; };

  const eye = (outer, inner, ups, lows) => {
    const o = Q(outer), n = Q(inner), w = d(o, n);
    // positief = buitenooghoek hoger dan binnenooghoek
    const tilt = Math.atan2(n.y - o.y, Math.abs(n.x - o.x)) * 180 / Math.PI;
    const h = ups.reduce((s, u, k) => s + d(Q(u), Q(lows[k])), 0) / ups.length;
    return { w, tilt, open: h / w };
  };
  const er = eye(33, 133, [160, 159, 158], [144, 145, 153]);
  const el = eye(263, 362, [387, 386, 385], [373, 374, 380]);
  const faceW = d(Q(234), Q(454));

  // Houding van het hoofd uit de transformatiematrix (kolom-voor-kolom opgeslagen)
  let yaw = 0, pitch = 0;
  const M = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
  if (M && M.data) {
    const m = M.data, r = (i, j) => m[j * 4 + i];
    yaw = Math.asin(Math.max(-1, Math.min(1, -r(2, 0)))) * 180 / Math.PI;
    pitch = Math.atan2(r(2, 1), r(2, 2)) * 180 / Math.PI;
  }
  const bs = {};
  const B = res.faceBlendshapes && res.faceBlendshapes[0];
  if (B && B.categories) B.categories.forEach(k => { bs[k.categoryName] = k.score; });
  const squint = Math.max(bs.eyeSquintLeft || 0, bs.eyeSquintRight || 0);
  const smile = Math.max(bs.mouthSmileLeft || 0, bs.mouthSmileRight || 0);

  const m = {
    tilt: (er.tilt + el.tilt) / 2,
    open: (er.open + el.open) / 2,
    sizeRatio: ((er.w + el.w) / 2) / faceW,
    faceW, yaw, pitch, roll: roll * 180 / Math.PI, squint, smile
  };
  if (faceW < LF_T.minFacePx) return { ok: false, reason: 'small', m };
  if (Math.abs(yaw) > LF_T.maxYaw) return { ok: false, reason: 'yaw', m };
  if (Math.abs(pitch) > LF_T.maxPitch) return { ok: false, reason: 'pitch', m };
  if (m.open < LF_T.minOpen) return { ok: false, reason: 'closed', m };
  if (squint > LF_T.maxSquint) return { ok: false, reason: 'squint', m };

  // Oogvorm: bij twijfel 'almond' (past bij de meeste stijlen)
  let shape = 'almond';
  if (m.tilt >= LF_T.tiltUp) shape = 'upturned';
  else if (m.tilt <= LF_T.tiltDown) shape = 'downturned';
  else if (m.open >= LF_T.roundOpen) shape = 'round';

  let size = 'medium';
  if (m.sizeRatio < LF_T.sizeSmall || (m.open < 0.22 && m.sizeRatio < 0.2)) size = 'small';
  else if (m.sizeRatio > LF_T.sizeLarge && m.open > 0.28) size = 'large';

  return { ok: true, shape, size, m };
}

async function lfAnalyze() {
  if (!lfCanvas) return;
  lfShow('lfShot', false);
  document.getElementById('lfSCard').classList.remove('show');
  const ld = document.getElementById('lfSLd');
  const ldText = document.getElementById('lfSLdText');
  ldText.textContent = lfLM ? 'Jouw oogvorm wordt gemeten…' : 'Scan wordt geladen…';
  ld.classList.add('show');
  const started = Date.now();
  let out;
  try {
    const lm = await lfLoadScanner();
    ldText.textContent = 'Jouw oogvorm wordt gemeten…';
    out = lfMeasure(lm.detect(lfCanvas), lfCanvas.width, lfCanvas.height);
  } catch (e) {
    console.error('Lash scan:', e);
    ld.classList.remove('show');
    lfErr(LF_SCAN_MSG.support, true);
    return;
  }
  // Laat de laadanimatie minstens even zien
  const wait = Math.max(0, 1800 - (Date.now() - started));
  setTimeout(() => {
    ld.classList.remove('show');
    if (!out.ok) { lfErr(LF_SCAN_MSG[out.reason] + lfDebugText(out.m)); return; }
    lfScan = out;
    lfScanAsk(0);
  }, wait);
}

function lfDebugText(m) {
  if (!LF_DEBUG || !m) return '';
  const f = (v, n) => (Math.round(v * Math.pow(10, n)) / Math.pow(10, n));
  return `<span class="lf-scan-debug" style="display:block">tilt ${f(m.tilt,1)}° · open ${f(m.open,3)} · grootte ${f(m.sizeRatio,3)} · gezicht ${Math.round(m.faceW)}px\nyaw ${f(m.yaw,1)}° · pitch ${f(m.pitch,1)}° · roll ${f(m.roll,1)}° · squint ${f(m.squint,2)} · smile ${f(m.smile,2)}</span>`;
}

// ---------- vragen na de scan ----------
// Een ooglidplooi (hangend ooglid / monolid) is op een foto niet betrouwbaar te meten,
// daarom vragen we het. Daarna dezelfde look- en ervaringsvragen als de quiz.
const LF_EYE = (lid) => `<svg class="lf-eye-svg" width="80" height="48" viewBox="0 0 80 48">
  <path d="M8,30 Q22,16 40,16 Q58,16 72,30 Q58,42 40,42 Q22,42 8,30 Z" fill="none" stroke="#7b4f6e" stroke-width="1.6"/>
  <circle cx="40" cy="29" r="8" fill="#d4829e" opacity="0.4"/><circle cx="40" cy="29" r="4.5" fill="#7b4f6e" opacity="0.65"/>
  ${lid}</svg>`;
const LF_SCAN_STEPS = [
  { key: 'lid', title: 'Nog één check: je ooglid', sub: 'Kijk met open ogen recht in de spiegel. Wat zie je boven je wimpers?', opts: [
    { v: 'crease',  label: 'Duidelijke vouw',  desc: 'Ik zie een plooi en een stukje beweeglijk ooglid', svg: LF_EYE('<path d="M10,22 Q40,2 70,22" fill="none" stroke="#1a0a12" stroke-width="1.6" stroke-linecap="round"/>') },
    { v: 'hooded',  label: 'Hangend ooglid',   desc: 'De huid hangt over de vouw; ik zie weinig of geen ooglid', svg: LF_EYE('<path d="M6,26 Q22,8 40,10 Q58,8 74,26 Q58,20 40,21 Q22,20 6,26 Z" fill="rgba(212,130,158,0.3)" stroke="#1a0a12" stroke-width="1.6"/>') },
    { v: 'monolid', label: 'Geen vouw',        desc: 'Mijn ooglid is glad, zonder zichtbare plooi', svg: LF_EYE('<path d="M8,30 Q22,16 40,16 Q58,16 72,30" fill="none" stroke="#1a0a12" stroke-width="2.6" stroke-linecap="round"/>') }
  ]},
  { key: 'look', title: 'Welke look zoek jij?', sub: 'Kies de vibe die bij jouw inner queen past 👑', opts: [
    { v: 'natural',  icon: '🌿', label: 'Natuurlijk',   desc: 'Jouw wimpers, maar mooier' },
    { v: 'glam',     icon: '✨', label: 'Full Glam',    desc: 'Gedurfd, dramatisch & een echte blikvanger' },
    { v: 'wispy',    icon: '🕊️', label: 'Wispy',        desc: 'Luchtig, getextureerd & ultra-vrouwelijk' },
    { v: 'balanced', icon: '⚖️', label: 'Gebalanceerd', desc: 'Vol maar draagbaar, voor elke gelegenheid' }
  ]},
  { key: 'lvl', title: 'Hoeveel ervaring heb jij met wimpers?', sub: 'We koppelen je aan de stijl die past bij jouw niveau', opts: [
    { v: 'beginner',     icon: '🌱', label: 'Beginner',   desc: 'Nieuw met wimpers — lekker simpel!' },
    { v: 'intermediate', icon: '💅', label: 'Gevorderd',  desc: 'Ik heb al een paar stijlen geprobeerd' },
    { v: 'pro',          icon: '👑', label: 'Lash Queen', desc: 'Ik ken mijn weg met wimpers' }
  ]}
];

function lfScanAsk(i) {
  const s = LF_SCAN_STEPS[i];
  const box = document.getElementById('lfScanQ');
  const opts = s.opts.map(o => `
    <div class="lf-opt${lfSA[s.key] === o.v ? ' selected' : ''}" onclick="lfScanPick(this,${i},'${o.v}')">
      <div class="lf-opt-check">✓</div>
      ${o.svg || `<span class="lf-opt-icon">${o.icon}</span>`}
      <div class="lf-opt-label">${o.label}</div>
      <div class="lf-opt-desc">${o.desc}</div>
    </div>`).join('');
  const last = i === LF_SCAN_STEPS.length - 1;
  box.innerHTML = `
    <p class="lf-step">Scan gelukt ✓ · vraag ${i + 1} van ${LF_SCAN_STEPS.length}</p>
    <h3 class="lf-qtitle">${s.title}</h3>
    <p class="lf-qsub">${s.sub}</p>
    <div class="lf-options">${opts}</div>
    <div class="lf-nav">
      ${i > 0 ? `<button class="lf-btn-back" onclick="lfScanAsk(${i - 1})">← Terug</button>` : '<div></div>'}
      <button class="lf-btn-next${lfSA[s.key] ? ' on' : ''}" id="lfScanNext" onclick="${last ? 'lfScanFinish()' : `lfScanAsk(${i + 1})`}">${last ? 'Mijn Match Bekijken ✦' : 'Volgende →'}</button>
    </div>`;
  lfShow('lfScanQ', true);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function lfScanPick(el, i, v) {
  el.closest('.lf-options').querySelectorAll('.lf-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  lfSA[LF_SCAN_STEPS[i].key] = v;
  document.getElementById('lfScanNext').classList.add('on');
}

function lfScanFinish() {
  const s = lfScan, m = s.m;
  const shape = (lfSA.lid === 'hooded' || lfSA.lid === 'monolid') ? lfSA.lid : s.shape;
  const recs = getQuizRecs(shape, s.size, lfSA.look, lfSA.lvl);

  const tiltTxt = m.tilt >= LF_T.tiltUp ? 'lopen duidelijk omhoog' : m.tilt >= 4 ? 'lopen licht omhoog' : m.tilt <= LF_T.tiltDown ? 'lopen iets omlaag' : 'liggen vrij recht';
  const sizeTxt = { small: 'aan de kleine kant', medium: 'gemiddeld van formaat', large: 'groot en expressief' }[s.size];
  const lidTxt = { crease: 'een duidelijke ooglidplooi', hooded: 'een hangend ooglid', monolid: 'een glad ooglid zonder plooi' }[lfSA.lid];
  const measure = `<span class="lf-scan-measure" style="display:block">
    <strong>Wat de scan zag:</strong> je buitenooghoeken ${tiltTxt} (${Math.round(m.tilt)}°), je ogen zijn ${sizeTxt}, en je gaf aan dat je ${lidTxt} hebt.<br>
    Klopt dit niet met wat je in de spiegel ziet? <a href="#" onclick="lfSwitch('quiz');return false;" style="color:var(--purple)">Doe dan de quiz</a> en vergelijk.
    ${lfDebugText(m)}</span>`;

  lfShow('lfScanQ', false);
  const card = document.getElementById('lfSCard');
  card.innerHTML = lfBuild({ recs, shape, customDesc: SHAPES[shape].desc + measure }, true);
  card.classList.add('show');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  lfTrack('Lash Scan Voltooid', { oogvorm: SHAPES[shape].label, ooggrootte: s.size, look: lfSA.look, ervaring: lfSA.lvl });
}

function lfTrack(event, props) {
  try { if (window.klaviyo && typeof window.klaviyo.push === 'function') window.klaviyo.push(['track', event, props]); } catch (e) {}
}

function lfErr(msg, offerQuiz) {
  lfShow('lfShot', false); lfShow('lfCam', false); lfShow('lfScanQ', false);
  const card = document.getElementById('lfSCard');
  card.innerHTML = `<div style="text-align:center;padding:40px 20px">
    <p style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--dark);margin-bottom:10px">Dat lukte nog niet</p>
    <p style="font-size:11px;color:var(--grey);margin-bottom:24px;line-height:1.7">${msg}</p>
    <button class="lf-btn-retake" onclick="lfReset()">↺ Opnieuw Proberen</button>
    ${offerQuiz ? `<button class="lf-btn-retake" style="margin-left:8px" onclick="lfReset();lfSwitch('quiz')">✦ Doe de Quiz</button>` : ''}
  </div>`;
  card.classList.add('show');
}
