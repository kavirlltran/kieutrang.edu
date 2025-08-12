// /api/evaluate.js
import Busboy from 'busboy';

export const config = { api: { bodyParser: false } };

function readMultipart(req) {
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
          field: name,
          filename: filename || 'audio.wav',
          mimeType: mimeType || 'audio/wav',
          buffer: Buffer.concat(chunks),
        };
      });
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ fields, fileInfo }));

    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fields, fileInfo } = await readMultipart(req);
    const text = (fields?.text || '').trim();

    if (!text || !fileInfo?.buffer?.length) {
      return res.status(400).json({ error: 'Missing text or audio' });
    }

    const API_URL = process.env.API_URL || 'https://api.speechace.co/api/scoring/text/v9/';
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Missing API_KEY in environment' });
    }

    const url = new URL(API_URL);
    url.searchParams.set('key', API_KEY);
    url.searchParams.set('dialect', 'en-us');

    // Node 18+/Vercel hỗ trợ fetch + FormData + Blob gốc
    const form = new FormData();
    form.set('text', text);
    form.set('user_audio_file', new Blob([fileInfo.buffer], { type: fileInfo.mimeType }), fileInfo.filename);

    const saResp = await fetch(url, { method: 'POST', body: form });
    const ct = saResp.headers.get('content-type') || '';
    let body;

    if (ct.includes('application/json')) {
      body = await saResp.json();          // đọc một lần nếu JSON
    } else {
      const raw = await saResp.text();     // còn lại coi như text/html
      body = { raw };
    }

    // Forward nguyên status code từ Speechace, nhưng đảm bảo trả JSON
    return res.status(saResp.status).json(body);
  } catch (err) {
    console.error('[evaluate] ERROR:', err);
    return res.status(500).json({ error: 'Internal Server Error', detail: err.message });
  }
}
