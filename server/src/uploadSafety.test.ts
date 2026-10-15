import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffKind } from './uploadSafety';

const bytes = (...b: number[]) => Buffer.from(b);

test('sniffKind: recognises each allowed kind by its magic bytes', () => {
  assert.equal(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'png');
  assert.equal(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpeg');
  assert.equal(sniffKind(Buffer.from('GIF89a....')), 'gif');
  assert.equal(sniffKind(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(sniffKind(Buffer.from('%PDF-1.7\n')), 'pdf');
});

test('sniffKind: script-capable formats are rejected even when named like images', () => {
  assert.equal(sniffKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>')), null);
  assert.equal(sniffKind(Buffer.from('<!doctype html><script>alert(1)</script>')), null);
  assert.equal(sniffKind(Buffer.from('<?xml version="1.0"?><svg/>')), null);
});

test('sniffKind: truncated or empty input is not mistaken for a valid file', () => {
  assert.equal(sniffKind(Buffer.alloc(0)), null);
  assert.equal(sniffKind(bytes(0x89, 0x50)), null);
  assert.equal(sniffKind(Buffer.from('RIFF\0\0\0\0WAVE')), null);
  assert.equal(sniffKind(Buffer.from('%PD')), null);
});
