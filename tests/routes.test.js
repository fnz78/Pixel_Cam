import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import apiRouter from '../server/routes.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRouter);

let server;
let baseUrl;

test.before((t, done) => {
  server = app.listen(0, () => {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    done();
  });
});

test.after((t, done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

test('POST /api/share - validates input', async () => {
  const res = await fetch(`${baseUrl}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: 'invalid-url' })
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test('POST /api/share and GET /api/share/:id - end-to-end share flow', async () => {
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const caption = 'Cool Polaroid';

  const shareRes = await fetch(`${baseUrl}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: validDataUrl, caption })
  });

  assert.equal(shareRes.status, 200);
  const shareData = await shareRes.json();
  assert.ok(shareData.id);
  assert.equal(shareData.id.length, 16);

  const getRes = await fetch(`${baseUrl}/api/share/${shareData.id}`);
  assert.equal(getRes.status, 200);
  const fetchedData = await getRes.json();

  assert.equal(fetchedData.imageDataUrl, validDataUrl);
  assert.equal(fetchedData.caption, caption);
});

test('GET /api/share/:id - returns 404 for non-existent ID', async () => {
  const res = await fetch(`${baseUrl}/api/share/0000000000000000`);
  assert.equal(res.status, 404);
});
