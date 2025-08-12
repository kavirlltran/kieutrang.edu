import React, { useEffect, useRef, useState, useMemo } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || window.__API_BASE__ || window.location.origin;

// ====== Cấu hình ngưỡng ASR Gate ======
const WER_MAX = 0.40;       // <= 0.40 là ổn
const JACCARD_MIN = 0.60;   // >= 0.60 là ổn

// ====== Utils nhỏ gọn ======
// Chuẩn hóa: bỏ *, ', ˈ để không ảnh hưởng so khớp/gate
const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[\*'ˈ]/gu, "")              // ← bỏ dấu trọng âm & apostrophe
    .replace(/[^\p{L}\p{N}\s]/gu, " ")    // giữ chữ/số/khoảng trắng
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (s) => norm(s).split(" ").filter(Boolean);

// Levenshtein WER
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[n][hyp.length] / n;
}

// Tương đồng từ vựng
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

// ====== App ======
export default function App() {
  // Ô nhập & lựa chọn hiển thị
  const [text, setText] = useState("a*merica, to*day, re*cord");
  const [pick, setPick] = useState({
    overview: true,
    pron: true,
    stress: true,
    vocab: false,
    phones: false,
  });

  // Ghi âm / audio
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [size, setSize] = useState(0);

  // Kết quả Speechace
  const [result, setResult] = useState(null);

  // ASR (Web Speech API)
  const [asrEnabled, setAsrEnabled] = useState(true);
  const [asrTranscript, setAsrTranscript] = useState("");  // interim
  const [asrFinal, setAsrFinal] = useState("");            // final
  const [gateWarn, setGateWarn] = useState(null);          // cảnh báo mismatch

  // Refs
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recognizerRef = useRef(null);
  const inputRef = useRef(null); // để chèn dấu *

  useEffect(() => { window.__API_BASE__ = API_BASE; }, []);

  const activeCls = (k) => (pick[k] ? "chip active" : "chip");
  const toggle = (k) => setPick((p) => ({ ...p, [k]: !p[k] }));

  // ---------- Nút chèn dấu * ----------
  function insertStress() {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const next = text.slice(0, start) + "*" + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + 1;
    });
  }

  // ---------- Speech Synthesis (nghe mẫu US/UK) ----------
  function getVoice(langPrefix = "en-US") {
    const list = window.speechSynthesis?.getVoices?.() || [];
    return (
      list.find((v) => v.lang === langPrefix) ||
      list.find((v) => v.lang?.startsWith(langPrefix.split("-")[0])) ||
      list[0]
    );
  }
  function speakSample(accent = "us") {
    if (!window.speechSynthesis) {
      alert("Trình duyệt không hỗ trợ Speech Synthesis.");
      return;
    }
    const textToSpeak = (text || "").trim();
    if (!textToSpeak) {
      alert("Nhập nội dung trước khi nghe mẫu.");
      return;
    }
    const u = new SpeechSynthesisUtterance(textToSpeak);
    const lang = accent === "uk" ? "en-GB" : "en-US";
    u.lang = lang;
    u.voice = getVoice(lang);
    u.rate = 0.95;
    u.pitch = 1.0;
    try { window.speechSynthesis.cancel(); } catch {}
    window.speechSynthesis.speak(u);
  }
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const ensure = () => window.speechSynthesis.getVoices();
    ensure();
    window.speechSynthesis.onvoiceschanged = ensure;
  }, []);

  // ---------- ASR start/stop ----------
  function startASR() {
    if (!asrEnabled) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let interim = "";
      let finals = "";
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
  function stopASR() {
    if (recognizerRef.current) {
      try { recognizerRef.current.stop(); } catch {}
      recognizerRef.current = null;
    }
  }

  // ---------- Ghi âm ----------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setSize(blob.size);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        stopASR();
      };
      mediaRef.current = rec;
      setResult(null);
      setAsrTranscript("");
      setAsrFinal("");
      rec.start();
      setRecording(true);
      startASR();
    } catch (e) {
      console.error(e);
      alert("Không thể truy cập micro. Vui lòng cấp quyền.");
    }
  };
  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };
  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioUrl(URL.createObjectURL(f));
    setSize(f.size);
    setResult(null);
    setAsrTranscript("");
    setAsrFinal("");
  };

  // ---------- Gate kiểm tra nội dung ----------
  function checkContentMatch() {
    if (!asrEnabled) return { ok: true, why: "ASR disabled" };
    const hypo = (asrFinal + " " + asrTranscript).trim();
    if (!hypo) return { ok: true, why: "No ASR" };
    const wer = wordErrorRate(text, hypo);
    const jac = jaccard(text, hypo);
    const ok = wer <= WER_MAX && jac >= JACCARD_MIN;
    return { ok, wer: +wer.toFixed(3), jaccard: +jac.toFixed(3), hypo };
  }

  // ---------- Submit ----------
  async function getBlob() {
    if (!audioUrl) return null;
    const r = await fetch(audioUrl);
    return await r.blob();
  }
  const submit = async (force = false) => {
    const blob = await getBlob();
    if (!blob) return alert("Hãy ghi âm hoặc chọn file trước.");
    if (!text.trim()) return alert("Nhập nội dung bạn sẽ đọc.");

    // Gate trước khi gọi API
    const gate = checkContentMatch();
    if (!force && !gate.ok) { setGateWarn(gate); return; }

    // Bỏ *, ' và ˈ trước khi gửi Speechace
    const clean = text.replace(/[\*'ˈ]/g, "");

    const fd = new FormData();
    fd.append("text", clean);
    fd.append("audio", blob, "recording.webm");

    const resp = await fetch(`${API_BASE}/api/evaluate`, { method: "POST", body: fd });
    const ct = resp.headers.get("content-type") || "";
    const payload = ct.includes("application/json") ? await resp.json() : { raw: await resp.text() };

    if (!resp.ok) {
      console.error(payload);
      alert("Speechace lỗi:\n" + JSON.stringify(payload, null, 2));
      return;
    }
    setResult({ ...payload, _asrGate: gate });
  };

  // ---------- UI helpers ----------
  const sizeKB = useMemo(() => (size ? `${Math.round(size / 1024)} KB` : ""), [size]);
  const chipLabel = { overview: "Tổng quan", pron: "Điểm phát âm", stress: "Trọng âm", vocab: "Bảng từ", phones: "Âm vị" };

  return (
    <>
      <h1 className="title">English Pronunciation &amp; Stress</h1>
      <p className="subtitle">
        Đánh dấu <b>trọng âm</b> bằng dấu <b>*</b> <i>đặt trước âm tiết nhấn</i>. Ví dụ: <i>a*merica, to*day, re*cord…</i>
      </p>

      {/* Chips */}
      <div className="toolbar">
        {ALL_CHIPS.map((k) => (
          <button key={k} className={activeCls(k)} onClick={() => toggle(k)} aria-pressed={pick[k]}>
            {chipLabel[k]}
          </button>
        ))}
        <button className="chip" onClick={() => setPick(Object.fromEntries(ALL_CHIPS.map((k) => [k, true])))}>Chọn tất cả</button>
        <button className="chip" onClick={() => setPick(Object.fromEntries(ALL_CHIPS.map((k) => [k, false])))}>Bỏ chọn</button>
      </div>

      {/* Bật/tắt kiểm tra nội dung (ASR) */}
      <div className="toolbar" style={{ marginTop: 0 }}>
        <label className={`chip ${asrEnabled ? "active" : ""}`} style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={asrEnabled}
            onChange={(e) => setAsrEnabled(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Kiểm tra nội dung (ASR Gate)
        </label>
      </div>

      {/* Ô nhập nội dung */}
      <div className="text-input-wrap">
        <textarea
          ref={inputRef}
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhập câu bạn sẽ đọc… (đặt dấu * trước âm tiết nhấn)"
        />

        {/* Nút chèn * + nghe US/UK */}
        <div className="sample-voice">
          <button className="btn" onClick={insertStress} title="Chèn dấu trọng âm (*)">＊</button>
          <button className="btn" onClick={() => speakSample("us")} title="Nghe mẫu giọng Mỹ">🔊 US</button>
          <button className="btn" onClick={() => speakSample("uk")} title="Nghe mẫu giọng Anh">🔊 UK</button>
        </div>
      </div>

      {/* Hàng nút */}
      <div className="actions">
        <button className="btn" onClick={recording ? stopRecording : startRecording}>
          {recording ? "⏹ Stop" : "🎤 Start Recording"}
        </button>
        <label className="btn" style={{ cursor: "pointer" }}>
          <input type="file" accept="audio/*" hidden onChange={onPickFile} />
          Chọn file WAV/WebM
        </label>
        <button className="btn primary" onClick={() => submit(false)}>⬆ Submit</button>
        <span className="muted">{sizeKB}</span>
      </div>

      {/* Audio preview */}
      {audioUrl && <audio controls src={audioUrl} />}

      {/* Hiển thị ASR live */}
      {asrEnabled && (asrFinal || asrTranscript) && (
        <p className="muted" style={{ marginTop: 6 }}>
          <b>ASR:</b> {(asrFinal + " " + asrTranscript).trim()}
        </p>
      )}

      {/* Cảnh báo Gate */}
      {gateWarn && (
        <div className="actions" style={{ marginTop: 12, flexDirection: "column" }}>
          <div className="muted" style={{ maxWidth: 820 }}>
            <b>Có vẻ bạn đọc khác nội dung mong đợi.</b> &nbsp;WER: <b>{gateWarn.wer}</b> • Jaccard: <b>{gateWarn.jaccard}</b>
            <br />
            Transcript: <i>{gateWarn.hypo}</i>
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setGateWarn(null)}>Thu lại</button>
            <button className="btn primary" onClick={() => (setGateWarn(null), submit(true))}>Gửi vẫn gửi</button>
          </div>
        </div>
      )}

      {/* Kết quả */}
      {result && <Results pick={pick} result={result} />}

      {/* CSS cơ bản */}
      <style>{`
        :root{
          --bg:#0b1220; --text:#eaf2ff; --muted:#9fb0c3; --border:rgba(255,255,255,.10);
          --panel-rgb: 15,22,41; --panel2-rgb:11,19,36; --panel-a:.76; --panel2-a:.45;
        }
        body{ background:#0b1220; color:var(--text); }
        .title,.subtitle{text-align:center;}
        .subtitle{color:var(--muted); margin-top:6px}
        .toolbar{display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin:14px 0 10px}
        .text-input-wrap{
          position:relative; margin:10px auto 6px; max-width:1000px;
          background:rgba(var(--panel2-rgb), var(--panel2-a)); border:1px solid var(--border);
          border-radius:16px; padding:14px; backdrop-filter:blur(4px)
        }
        .text-input{
          width:100%; min-height:180px; resize:vertical; padding:14px 14px 54px;
          border-radius:12px; border:1px solid var(--border); background:#0a1220; color:var(--text)
        }
        .actions{display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:14px}
        .btn{background:#17203a; border:1px solid var(--border); padding:8px 12px; border-radius:10px; color:var(--text)}
        .btn.primary{background:#1f9d6a; border-color:transparent}
        .chip{background:#101a2f; border:1px solid var(--border); padding:8px 12px; border-radius:999px; color:var(--text)}
        .chip.active{background:#112f2a; border-color:#1f9d6a}
        .muted{color:var(--muted)}
        .sample-voice{position:absolute; left:16px; bottom:12px; display:flex; gap:8px}
      `}</style>
    </>
  );
}

// ====== Hiển thị results ======
function Results({ pick, result }) {
  const words = result?.text_score?.word_score_list || [];
  const on = (k) => !!pick[k];

  return (
    <div className="table-wrap" style={{ marginTop: 14 }}>
      {on("overview") && (
        <p className="muted" style={{ marginBottom: 8 }}>
          Request ID: <code>{result?.request_id}</code>
          {result?._asrGate && (
            <>
              {" • "}WER: <b>{result._asrGate.wer ?? "-"}</b> • Jaccard: <b>{result._asrGate.jaccard ?? "-"}</b>
            </>
          )}
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
              {on("vocab") && <td className="muted">Đánh dấu bằng dấu <b>*</b> trong ô nhập</td>}
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
          Speechace: <b>{result?.text_score?.speechace_score?.pronunciation ?? "-"}</b> • CEFR:{" "}
          <b>{result?.text_score?.cefr_score?.pronunciation ?? "-"}</b> • IELTS:{" "}
          <b>{result?.text_score?.ielts_score?.pronunciation ?? "-"}</b> • TOEIC:{" "}
          <b>{result?.text_score?.toeic_score?.pronunciation ?? "-"}</b>
        </p>
      )}
    </div>
  );
}
