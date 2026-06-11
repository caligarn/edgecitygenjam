/* /api/media — shared image storage for the deck (Vercel Blob).
 *
 * GET    /api/media            → { "<media-key>": "<blob url>", ... }
 * POST   /api/media?key=K      → store request body as the image for K
 *                                 (requires header  x-edit-key: $DECK_EDIT_KEY)
 * DELETE /api/media?key=K      → remove the stored image for K (same header)
 *
 * Setup (one time, in the Vercel dashboard):
 *   1. Storage → Create → Blob → connect it to this project
 *      (this auto-adds the BLOB_READ_WRITE_TOKEN env var).
 *   2. Project → Settings → Environment Variables →
 *      add DECK_EDIT_KEY = any passphrase you choose.
 *   3. Redeploy. In the deck, the first upload will ask for that passphrase.
 */
import { put, list, del } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

const PREFIX = 'deck-media/';
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4',
  'video/webm': 'webm', 'video/quicktime': 'mov',
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
      blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      const manifest = {};
      for (const b of blobs) {
        const key = decodeURIComponent(b.pathname.slice(PREFIX.length)).replace(/\.[a-z0-9]+$/i, '');
        manifest[key] = b.url; // later uploads win
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(manifest);
    }

    if (!process.env.DECK_EDIT_KEY) {
      return res.status(501).json({ error: 'DECK_EDIT_KEY env var not set on the Vercel project' });
    }
    if (req.headers['x-edit-key'] !== process.env.DECK_EDIT_KEY) {
      return res.status(401).json({ error: 'wrong edit key' });
    }
    const key = String(req.query.key || '').replace(/[^a-z0-9_-]/gi, '');
    if (!key) return res.status(400).json({ error: 'missing ?key=' });

    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || 'application/octet-stream';
      const ext = EXT[contentType] || 'bin';
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buf = Buffer.concat(chunks);
      if (!buf.length) return res.status(400).json({ error: 'empty body' });
      if (buf.length > 50 * 1024 * 1024) return res.status(413).json({ error: 'file too large (50MB max)' });
      const { blobs: old } = await list({ prefix: `${PREFIX}${key}.` });
      const blob = await put(`${PREFIX}${key}.${ext}`, buf, {
        access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType,
      });
      await Promise.all(old.filter((b) => b.url !== blob.url).map((b) => del(b.url)));
      return res.status(200).json({ url: blob.url });
    }

    if (req.method === 'DELETE') {
      const { blobs } = await list({ prefix: `${PREFIX}${key}.` });
      await Promise.all(blobs.map((b) => del(b.url)));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('media api error', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
