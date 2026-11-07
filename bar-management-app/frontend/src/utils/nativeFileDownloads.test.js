import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeAndroidApp, saveBlobToAndroidDocuments } from './nativeFileDownloads.js';

test('uses native saving only when the Android document bridge is available', () => {
  const originalWindow = globalThis.window;
  try {
    delete globalThis.window;
    assert.equal(isNativeAndroidApp(), false);

    globalThis.window = { saveBlobToAndroidDocuments: async () => ({ size: 4 }) };
    assert.equal(isNativeAndroidApp(), true);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('awaits Android saving and rejects an unverified file size', async () => {
  const originalWindow = globalThis.window;
  try {
    const blob = new Blob(['report']);
    globalThis.window = { saveBlobToAndroidDocuments: async () => ({ size: blob.size }) };
    assert.deepEqual(await saveBlobToAndroidDocuments(blob, 'report.pdf'), { size: blob.size });

    globalThis.window.saveBlobToAndroidDocuments = async () => ({ size: 0 });
    await assert.rejects(saveBlobToAndroidDocuments(blob, 'report.pdf'), /could not be verified/i);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});