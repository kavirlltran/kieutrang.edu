// /api/evaluate.js
// Serverless function trên Vercel, Node 18
// - Parse multipart chắc chắn bằng busboy
// - Gọi Speechace v9 với API_URL + API_KEY từ env
// - Mặc định KHÔNG bật CORS (same-origin). Nếu muốn cho domain khác gọi, set ALLOWED_ORIGIN bên dưới.

const ALLOWED_ORIGIN = null; // ví dụ: 'https://kieutrangedu.vercel.app'

async function readMultipart(req) {
  const { default: Busboy } = await import('busboy');
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let fileInfo = null;

    busboy.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('end', () => {
        fileInfo = {
          fieldname: name,
          filename: filename || 'recording.webm',
          mimeType: mimeType || 'audio/webm',
          buffer: Buffer.concat(chunks),
        };
      });
    });

    busboy.on('field', (name, val) => { fields[name] = val; });
    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ fields, file: fileInfo }));
    req.pipe(busboy);
  });
}

export const config = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  try {
    // CORS (chỉ cần khi gọi khác domain)
    if (ALLOWED_ORIGIN) {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(204).end();
      }
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const API_KEY = process.env.SPEECHACE_API_KEY || process.env.API_KEY;
    const API_URL = process.env.API_URL || 'https://api.speechace.co/api/scoring/text/v9/json';
    if (!API_KEY) return res.status(500).json({ error: 'Missing API_KEY in environment' });

    const { fields, file } = await readMultipart(req);
    const text = (fields?.text || '').replace(/'/g, '');
    if (!file?.buffer?.length) return res.status(400).json({ error: 'Missing audio file' });

    // Node 18: có sẵn Blob/FormData
    const blob = new Blob([file.buffer], { type: file.mimeType || 'application/octet-stream' });
    const form = new FormData();
    form.append('text', text);
    form.append('user_audio_file', blob, file.filename || 'recording.webm');

    const url = `${API_URL}?key=${encodeURIComponent(API_KEY)}&dialect=en-us`;

    const r = await fetch(url, { method: 'POST', body: form });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };

    return res.status(r.status).json(data);
  } catch (err) {
    console.error('[api/evaluate] error:', err);
    return res.status(500).json({ error: 'Internal Server Error', detail: String(err?.message || err) });
  }
}
