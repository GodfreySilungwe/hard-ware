export function resolveReceiptPrintAction({ nativePrinter, isAndroidApp = false, receiptText = '' }) {
  if (!nativePrinter || typeof nativePrinter.printText !== 'function') {
    if (isAndroidApp) {
      return {
        status: 'error',
        message: 'Bluetooth printer not connected. Please pair the printer and try again.'
      };
    }

    return { status: 'fallback' };
  }

  const result = nativePrinter.printText(receiptText);

  if (result === 'printed') {
    return { status: 'printed' };
  }

  if (typeof result === 'string' && result.startsWith('error:')) {
    return {
      status: 'error',
      message: result.replace(/^error:\s*/, '')
    };
  }

  return {
    status: 'error',
    message: 'The printer command did not complete. Please try again.'
  };
}