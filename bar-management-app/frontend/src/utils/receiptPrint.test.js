import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceiptPrintAction } from './receiptPrint.js';

test('returns an Android-specific error instead of silently doing nothing when no native printer is available', () => {
  const result = resolveReceiptPrintAction({
    nativePrinter: undefined,
    isAndroidApp: true,
    receiptText: 'Sample receipt'
  });

  assert.equal(result.status, 'error');
  assert.match(result.message, /Bluetooth printer/i);
});
