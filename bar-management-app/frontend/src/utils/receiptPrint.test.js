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

test('falls back to browser printing when no native Android printer bridge is available', () => {
  const result = resolveReceiptPrintAction({
    nativePrinter: undefined,
    isAndroidApp: false,
    receiptText: 'Sample receipt'
  });

  assert.deepEqual(result, { status: 'fallback' });
});

test('uses the native printer bridge when it is available', () => {
  let printedText = '';
  const result = resolveReceiptPrintAction({
    nativePrinter: { printText: (text) => { printedText = text; return 'printed'; } },
    isAndroidApp: true,
    receiptText: 'Sample receipt'
  });

  assert.equal(printedText, 'Sample receipt');
  assert.deepEqual(result, { status: 'printed' });
});
