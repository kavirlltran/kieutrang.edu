import React, { useEffect, useRef, useState, useMemo } from "react";

const API_BASE = import.meta.env.PROD
  ? window.location.origin
  : (import.meta.env.VITE_API_BASE || window.location.origin);

const CONTENT_FILE = import.meta.env.VITE_CONTENT_FILE || "/contents.txt";

const WER_MAX = 0.40;
const JACCARD_MIN = 0.60;

/* ===== Utils (bỏ dấu * và ' trước khi so sánh/chấm) ===== */
const stripMarkers = (s) => (s || "").replace(/['*]/g, "");
const norm = (s) =>
  stripMarkers(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokenize = (s) => norm(s).split(" ").filter(Boolean);

function wordErrorRate(refText, hypText) {
  const ref = tokenize(refText);
  const hyp = tokenize(hypText);
  const n = ref.length;
  if (!n) return 0;
  const dp = Array.from({ length: n + 1 }, () => Array(hyp.length + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= hyp.length; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[n][hyp.length] / n;
}
function jaccard(aText, bText) {
  const A = new Set(tokenize(aText));
  const B = new Set(tokenize(bText));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return inter / (uni || 1);
}

const ALL_CHIPS = ["overview", "pron", "stress", "vocab", "phones"];

/* ============== ROBOT 3D SVG ============== */
function Robot3D({ talking }) {
  return (
    <div className={`robot3d ${talking ? "talking" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 280 260">
        <defs>
          <linearGradient id="rb-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#79c7ff" />
            <stop offset="55%" stopColor="#2aa3ff" />
            <stop offset="100%" stopColor="#1664e6" />
          </linearGradient>
          <linearGradient id="rb-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e6eef7" />
            <stop offset="45%" stopColor="#a6b3c5" />
            <stop offset="100%" stopColor="#7a8797" />
          </linearGradient>
          <radialGradient id="rb-screen" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#121a33" />
            <stop offset="100%" stopColor="#0b1022" />
          </radialGradient>
          <linearGradient id="rb-gloss" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,.55)" />
            <stop offset="80%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="rb-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000" floodOpacity="0.35" />
          </filter>
          <filter id="rb-glow">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse cx="140" cy="242" rx="70" ry="12" fill="rgba(0,0,0,.35)" />

        <g filter="url(#rb-shadow)">
          <rect x="96" y="152" width="88" height="72" rx="34" fill="url(#rb-body)" />
          <path d="M100 158c0-6 12-10 22-12h44c10 2 22 6 22 12v0" fill="rgba(255,255,255,.08)" />
        </g>

        <g transform="translate(22,142)">
          <rect x="20" y="14" width="64" height="18" rx="9" fill="url(#rb-metal)" />
          <circle cx="18" cy="24" r="16" fill="url(#rb-metal)" />
          <path d="M18 10a14 14 0 1 0 0 28" fill="none" stroke="#0f1629" strokeWidth="8" strokeLinecap="round" />
        </g>

        <g transform="translate(174,142)">
          <rect x="0" y="14" width="64" height="18" rx="9" fill="url(#rb-metal)" />
          <circle cx="66" cy="24" r="16" fill="url(#rb-metal)" />
          <path d="M66 38a14 14 0 1 0 0-28" fill="none" stroke="#0f1629" strokeWidth="8" strokeLinecap="round" />
        </g>

        <g className="rb-head" filter="url(#rb-shadow)">
          <rect x="48" y="28" width="184" height="116" rx="36" fill="url(#rb-body)" />
          <rect x="64" y="44" width="152" height="84" rx="24" fill="#1e2a48" opacity=".22" />
          <rect x="66" y="46" width="148" height="80" rx="22" fill="url(#rb-screen)" />
          <g className="rb-eyes" filter="url(#rb-glow)">
            <radialGradient id="eyeG" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#d9fffb" />
              <stop offset="100%" stopColor="#86ffe5" />
            </radialGradient>
            <circle cx="112" cy="86" r="11" fill="url(#eyeG)" />
            <circle cx="168" cy="86" r="11" fill="url(#eyeG)" />
          </g>
          <g className="rb-mouth">
            <rect x="118" y="106" width="44" height="12" rx="6" fill="#bffff2" />
          </g>
          <path d="M78,58 C110,36 168,36 198,58" fill="none" stroke="url(#rb-gloss)" strokeWidth="10" strokeLinecap="round" opacity=".8" />
          <circle cx="140" cy="16" r="9" fill="#6fffe0" />
          <rect x="138" y="18" width="4" height="12" rx="2" fill="#97f5dd" />
        </g>
      </svg>
    </div>
  );
}

/* ============== APP ============== */
export default function App() {
  // text lấy từ contents.txt
  const [text, setText] = useState("");
  const [lines, setLines] = useState([]);
  const [sel, setSel] = useState(0);

  const [pick, setPick] = useState({ overview: true, pron: true, stress: true, vocab: false, phones: false });

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [size, setSize] = useState(0);
  const [result, setResult] = useState(null);

  const [asrEnabled, setAsrEnabled] = useState(true);
  const [asrTranscript, setAsrTranscript] = useState("");
  const [asrFinal, setAsrFinal] = useState("");
  const [gateWarn, setGateWarn] = useState(null);

  const [robotTalking, setRobotTalking] = useState(false);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recognizerRef = useRef(null);

  const activeCls = (k) => (pick[k] ? "chip active" : "chip");
  const toggle = (k) => setPick((p) => ({ ...p, [k]: !p[k] }));

  // Nạp nội dung từ file .txt (mỗi dòng 1 câu)
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const resp = await fetch(CONTENT_FILE, { cache: "no-store" });
        if (!resp.ok) throw new Error(`Không đọc được ${CONTENT_FILE}`);
        const raw = await resp.text();
        const arr = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (!ignore) {
          setLines(arr);
          setSel(0);
          setText(arr[0] || "");
        }
      } catch (e) {
        console.error(e);
        if (!ignore) alert("Không thể đọc file nội dung.\nTạo 'client/public/contents.txt' (mỗi dòng 1 câu).");
      }
    })();
    return () => { ignore = true; };
  }, []);

  // --- Speech Synthesis (US/UK) ---
  function getVoice(langPrefix = "en-US") {
    const list = window.speechSynthesis?.getVoices?.() || [];
    return list.find((v) => v.lang === langPrefix) || list.find((v) => v.lang?.startsWith(langPrefix.split("-")[0])) || list[0];
  }
  function speakSample(accent = "us") {
    if (!window.speechSynthesis) { alert("Trình duyệt không hỗ trợ Speech Synthesis."); return; }
    const t = (text || "").trim();
    if (!t) { alert("Chọn nội dung trước khi nghe mẫu."); return; }
    const u = new SpeechSynthesisUtterance(stripMarkers(t));
    const lang = accent === "uk" ? "en-GB" : "en-US";
    u.lang = lang; u.voice = getVoice(lang); u.rate = 0.95; u.pitch = 1.0;
    u.onstart = () => setRobotTalking(true);
    u.onend = () => setRobotTalking(false);
    u.onpause = () => setRobotTalking(false);
    u.onresume = () => setRobotTalking(true);
    try { window.speechSynthesis.cancel(); } catch {}
    window.speechSynthesis.speak(u);
  }
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const ensure = () => window.speechSynthesis.getVoices();
    ensure(); window.speechSynthesis.onvoiceschanged = ensure;
    return () => { try { window.speechSynthesis.cancel(); } catch {}; setRobotTalking(false); };
  }, []);

  // --- ASR ---
  function startASR() {
    if (!asrEnabled) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.continuous = true;
    r.onresult = (e) => {
      let interim = "", finals = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += " " + res[0].transcript;
        else interim += res[0].transcript + " ";
      }
      setAsrTranscript(interim);
      if (finals.trim()) setAsrFinal((prev) => (prev + " " + finals).trim());
    };
    r.onerror = (err) => console.warn("ASR error:", err);
    r.onend = () => { try { if (recording && asrEnabled) r.start(); } catch {} };
    recognizerRef.current = r;
    try { r.start(); } catch {}
  }
  function stopASR() { if (recognizerRef.current) { try { recognizerRef.current.stop(); } catch {}; recognizerRef.current = null; } }

  // --- Record ---
  const startRecording = async () => {
    if (!text.trim()) return alert("Hãy chọn nội dung trước khi ghi âm.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setSize(blob.size); setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop()); stopASR();
      };
      mediaRef.current = rec;
      setResult(null); setAsrTranscript(""); setAsrFinal("");
      rec.start(); setRecording(true); startASR();
    } catch (e) { console.error(e); alert("Không thể truy cập micro. Vui lòng cấp quyền."); }
  };
  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false); };
  const onPickFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setAudioUrl(URL.createObjectURL(f)); setSize(f.size);
    setResult(null); setAsrTranscript(""); setAsrFinal("");
  };

  // --- Gate ---
  function checkContentMatch() {
    if (!asrEnabled) return { ok: true, why: "ASR disabled" };
    const hypo = (asrFinal + " " + asrTranscript).trim();
    if (!hypo) return { ok: true, why: "No ASR" };
    const wer = wordErrorRate(text, hypo);
    const jac = jaccard(text, hypo);
    const ok = wer <= WER_MAX && jac >= JACCARD_MIN;
    return { ok, wer: +wer.toFixed(3), jaccard: +jac.toFixed(3), hypo };
  }

  // --- Submit ---
  async function getBlob() { if (!audioUrl) return null; const r = await fetch(audioUrl); return await r.blob(); }
  const submit = async (force = false) => {
    const blob = await getBlob();
    if (!blob) return alert("Hãy ghi âm hoặc chọn file trước.");
    if (!text.trim()) return alert("Chọn nội dung bạn sẽ đọc.");
    const gate = checkContentMatch();
    if (!force && !gate.ok) { setGateWarn(gate); return; }
    const fd = new FormData();
    fd.append("text", stripMarkers(text)); // bỏ * / ' trước khi gửi
    fd.append("audio", blob, "recording.webm");
    const resp = await fetch(`${API_BASE}/api/evaluate`, { method: "POST", body: fd });
    const ct = resp.headers.get("content-type") || "";
    const payload = ct.includes("application/json") ? await resp.json() : { raw: await resp.text() };
    if (!resp.ok) { console.error(payload); alert("Speechace lỗi:\n" + JSON.stringify(payload, null, 2)); return; }
    setResult({ ...payload, _asrGate: gate });
  };

  const sizeKB = useMemo(() => (size ? `${Math.round(size / 1024)} KB` : ""), [size]);

  // chọn câu
  const selectByIndex = (idx) => {
    if (!lines.length) return;
    const i = Math.max(0, Math.min(idx, lines.length - 1));
    setSel(i);
    setText(lines[i] || "");
    setResult(null);
    setAsrTranscript("");
    setAsrFinal("");
  };

  return (
    <>
      <style>{`
        :root{
          --bg:#0b1220; --text:#eaf2ff; --muted:#9fb0c3; --border:rgba(255,255,255,.10);
          --shadow:0 14px 40px rgba(0,0,0,.35);
          --panel-rgb: 15,22,41; --panel2-rgb: 11,19,36;
          --panel-a:.76; --panel2-a:.45;
        }
        body{ background-color:var(--bg); color:var(--text); }
        .shell{
          max-width:1000px; margin:28px auto; padding:24px;
          background:rgba(var(--panel-rgb), var(--panel-a));
          border:1px solid var(--border); border-radius:18px; box-shadow:var(--shadow);
          position:relative;
        }
        .title,.subtitle{text-align:center;} .subtitle{color:var(--muted); margin-top:6px;}
        .toolbar{display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin:14px 0 10px;}
        .actions{display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:14px;}
        .chip{padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:#0a1220; color:var(--text);}
        .chip.active{outline:2px solid rgba(41,163,106,.6);}

        /* === Picker thay cho textarea === */
        .text-picker-wrap{
          position:relative; margin:10px auto 6px;
          background:rgba(var(--panel2-rgb), var(--panel2-a));
          border:1px solid var(--border); border-radius:16px; padding:14px 14px 54px;
          overflow:hidden; /* tránh lòi khung */
        }
        .picker-row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
        .select{
          display:block; width:100%; max-width:560px;
          padding:8px 10px; border-radius:10px; border:1px solid var(--border);
          background:#0a1220; color:var(--text); box-sizing:border-box;
        }
        .picked-text{
          display:block; width:100%; max-width:100%;
          padding:14px; border-radius:12px; border:1px solid var(--border);
          background:#0a1220; line-height:1.55; white-space:pre-wrap; box-sizing:border-box;
          min-height:72px;
        }
        .sample-voice{position:absolute; left:16px; bottom:16px; display:flex; gap:8px;}
        .robot3d{ position:absolute; right:6px; bottom:8px; width:170px; height:170px; pointer-events:none; }
        @media (max-width: 680px){
          .text-picker-wrap{ padding-bottom:64px; }
          .robot3d{ position:relative; right:auto; bottom:auto; width:130px; height:130px; margin:10px auto 4px; }
          .sample-voice{ left:12px; bottom:12px; }
        }
        @media (prefers-reduced-motion: reduce){
          .robot3d .rb-head, .robot3d .rb-mouth, .robot3d .rb-eyes{ animation: none !important; }
        }
      `}</style>

      <div className="shell">
        <h1 className="title">English Pronunciation &amp; Stress</h1>
        <p className="subtitle">
          Đánh dấu <b>trọng âm</b> bằng dấu sao (<code>*</code>) đặt trước âm tiết nhấn. Ví dụ: <i>a*merica, to*day, re*cord…</i><br/>
          Nội dung lấy từ <code>{CONTENT_FILE}</code> (mỗi dòng 1 câu).
        </p>

        <div className="toolbar">
          {ALL_CHIPS.map((k) => (
            <button key={k} className={activeCls(k)} onClick={() => toggle(k)} aria-pressed={pick[k]}>
              {({overview:"Tổng quan",pron:"Điểm phát âm",stress:"Trọng âm",vocab:"Bảng từ",phones:"Âm vị"})[k]}
            </button>
          ))}
          <button className="chip" onClick={() => setPick(Object.fromEntries(ALL_CHIPS.map((k) => [k, true])))}>
            Chọn tất cả
          </button>
          <button className="chip" onClick={() => setPick(Object.fromEntries(ALL_CHIPS.map((k) => [k, false])))}>
            Bỏ chọn
          </button>
        </div>

        <div className="toolbar" style={{ marginTop: 0 }}>
          <label className={`chip ${asrEnabled ? "active" : ""}`} style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={asrEnabled} onChange={(e) => setAsrEnabled(e.target.checked)} style={{ marginRight: 6 }} />
            Kiểm tra nội dung (ASR Gate)
          </label>
        </div>

        {/* PICKER + US/UK + ROBOT */}
        <div className="text-picker-wrap">
          <div className="picker-row">
            <label htmlFor="contentSelect" className="muted">Chọn nội dung:</label>
            <select
              id="contentSelect"
              className="select"
              value={sel}
              onChange={(e) => selectByIndex(Number(e.target.value))}
              disabled={!lines.length}
            >
              {lines.length ? (
                lines.map((s, i) => (
                  <option key={i} value={i}>
                    {`${i + 1}. ${s.length > 80 ? s.slice(0, 80) + "…" : s}`}
                  </option>
                ))
              ) : (
                <option>Đang tải nội dung...</option>
              )}
            </select>
            <button className="chip" onClick={() => selectByIndex(sel - 1)} disabled={!lines.length || sel <= 0}>◀ Trước</button>
            <button className="chip" onClick={() => selectByIndex(sel + 1)} disabled={!lines.length || sel >= lines.length - 1}>Sau ▶</button>
            <button className="chip" onClick={() => { if (lines.length) selectByIndex(Math.floor(Math.random() * lines.length)); }} disabled={!lines.length}>
              🎲 Ngẫu nhiên
            </button>
          </div>

          <div className="picked-text">{text || "— Chưa có nội dung —"}</div>

          <div className="sample-voice">
            <button type="button" className="chip" title="Nghe mẫu giọng Mỹ (en-US)" onClick={(e) => { e.preventDefault(); speakSample("us"); }}>
              🔊 US
            </button>
            <button type="button" className="chip" title="Nghe mẫu giọng Anh (en-GB)" onClick={(e) => { e.preventDefault(); speakSample("uk"); }}>
              🔊 UK
            </button>
          </div>

          <Robot3D talking={robotTalking} />
        </div>

        <div className="actions">
          <button className="chip" onClick={recording ? stopRecording : startRecording}>
            {recording ? "⏹ Stop" : "🎤 Start Recording"}
          </button>

          <label className="chip" style={{ cursor: "pointer" }}>
            <input type="file" accept="audio/*" hidden onChange={onPickFile} />
            Chọn file WAV/WebM
          </label>

        <button className="chip" onClick={() => submit(false)}>⬆ Submit</button>
          <span className="muted">{sizeKB}</span>
        </div>

        {audioUrl && <audio controls src={audioUrl} />}

        {asrEnabled && (asrFinal || asrTranscript) && (
          <p className="muted" style={{ marginTop: 6 }}>
            <b>ASR:</b> {(asrFinal + " " + asrTranscript).trim()}
          </p>
        )}

        {gateWarn && (
          <div className="actions" style={{ marginTop: 12, flexDirection: "column" }}>
            <div className="muted" style={{ maxWidth: 820 }}>
              <b>Có vẻ bạn đọc khác nội dung mong đợi.</b> &nbsp;WER: <b>{gateWarn.wer}</b> • Jaccard: <b>{gateWarn.jaccard}</b>
              <br />Transcript: <i>{gateWarn.hypo}</i>
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="chip" onClick={() => setGateWarn(null)}>Thu lại</button>
              <button className="chip" onClick={() => (setGateWarn(null), submit(true))}>Gửi vẫn gửi</button>
            </div>
          </div>
        )}

        {result && <Results pick={pick} result={result} />}
      </div>
    </>
  );
}

/* ===== Results ===== */
function Results({ pick, result }) {
  const words = result?.text_score?.word_score_list || [];
  const on = (k) => !!pick[k];
  return (
    <div className="table-wrap" style={{ marginTop: 14 }}>
      {on("overview") && (
        <p className="muted" style={{ marginBottom: 8 }}>
          Request ID: <code>{result?.request_id}</code>
          {result?._asrGate && <>{" • "}WER: <b>{result._asrGate.wer ?? "-"}</b> • Jaccard: <b>{result._asrGate.jaccard ?? "-"}</b></>}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Word</th>
            {on("pron") && <th>Pron</th>}
            {on("stress") && <th>Predicted stress</th>}
            {on("vocab") && <th>Expected stress*</th>}
            {on("phones") && <th>Phones (score)</th>}
          </tr>
        </thead>
        <tbody>
          {words.map((w, i) => (
            <tr key={i}>
              <td>{w.word}</td>
              {on("pron") && <td>{Math.round(w.quality_score)}</td>}
              {on("stress") && <td>{w.predicted_stress_level ?? "-"}</td>}
              {on("vocab") && <td className="muted">0/1 dựa trên dấu <code>*</code> trong dòng nội dung</td>}
              {on("phones") && (
                <td>
                  {(w.phone_score_list || []).map((p, j) => (
                    <span key={j} style={{ marginRight: 10 }}>
                      <code>{p.phone}</code>({Math.round(p.quality_score)})
                    </span>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {on("overview") && (
        <p className="muted" style={{ marginTop: 10 }}>
          Speechace: <b>{result?.text_score?.speechace_score?.pronunciation ?? "-"}</b> • CEFR: <b>{result?.text_score?.cefr_score?.pronunciation ?? "-"}</b> • IELTS: <b>{result?.text_score?.ielts_score?.pronunciation ?? "-"}</b> • TOEIC: <b>{result?.text_score?.toeic_score?.pronunciation ?? "-"}</b>
        </p>
      )}
    </div>
  );
}
