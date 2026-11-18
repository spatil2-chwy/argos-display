import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMp4Response } from './mp4-response.mjs';

test('serves the whole MP4 when no supported single range is requested', () => {
  for (const header of [undefined, 'bytes=-', 'bytes=0-9,20-29', 'items=0-9']) {
    assert.deepEqual(getMp4Response(100, header), {
      status: 200,
      headers: { 'Accept-Ranges': 'bytes', 'Content-Length': 100 },
    });
  }
});

test('serves bounded, open-ended, and suffix byte ranges', () => {
  for (const [header, start, end] of [
    ['bytes=0-0', 0, 0],
    ['bytes=20-39', 20, 39],
    ['bytes=80-', 80, 99],
    ['bytes=80-120', 80, 99],
    ['bytes=-20', 80, 99],
    ['bytes=-120', 0, 99],
  ]) {
    assert.deepEqual(getMp4Response(100, header), {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/100`,
      },
      range: { start, end },
    });
  }
});

test('rejects unsatisfiable ranges with the MP4 size', () => {
  for (const [size, header] of [
    [0, 'bytes=0-'],
    [100, 'bytes=100-'],
    [100, 'bytes=40-20'],
    [100, 'bytes=-0'],
  ]) {
    assert.deepEqual(getMp4Response(size, header), {
      status: 416,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': 0,
        'Content-Range': `bytes */${size}`,
      },
    });
  }
});
