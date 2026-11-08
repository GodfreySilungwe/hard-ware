(function () {
  if (window.__androidPlatformBridgeInstalled || !window.AndroidTransferBridge) return;

  window.__androidPlatformBridgeInstalled = true;
  const pendingRequests = new Map();
  const originalFetch = window.fetch.bind(window);

  window.__androidTransferComplete = (requestId, result) => {
    const resolve = pendingRequests.get(requestId);
    if (!resolve) return;
    pendingRequests.delete(requestId);
    resolve(result);
  };

  const callNative = (method, args) => new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingRequests.set(requestId, resolve);
    window.AndroidTransferBridge[method](...args, requestId);
    window.setTimeout(() => {
      if (!pendingRequests.has(requestId)) return;
      pendingRequests.delete(requestId);
      resolve({ status: 504, message: 'Android file transfer timed out.' });
    }, 90000);
  });

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(blob);
  });

  window.saveBlobToAndroidDocuments = async (blob, filename) => {
    if (!(blob instanceof Blob)) throw new TypeError('An export file is required.');
    const encodedBody = await blobToBase64(blob);
    const result = await callNative('saveDownload', [filename, blob.type || 'application/octet-stream', encodedBody]);
    if (result.status !== 200 || !Number.isFinite(result.size) || result.size <= 0) {
      throw new Error(result.message || 'The export could not be saved to Documents.');
    }
    if (result.size !== blob.size) {
      throw new Error(`Saved file size did not match the export (${result.size} of ${blob.size} bytes).`);
    }
    return { size: result.size };
  };

  const canSharePdf = (data = {}) => Array.isArray(data.files)
    && data.files.length === 1
    && (data.files[0].type === 'application/pdf' || /\.pdf$/i.test(data.files[0].name || ''));

  const sharePdf = async (data = {}) => {
    if (!canSharePdf(data)) throw new Error('Android sharing supports one PDF file at a time.');
    const file = data.files[0];
    const encodedBody = await blobToBase64(file);
    const result = await callNative('sharePdf', [
      file.name || 'quotation.pdf',
      encodedBody,
      data.text || '',
      data.title || 'Quotation'
    ]);
    if (result.status !== 200 || result.size !== file.size) {
      throw new Error(result.message || 'Could not attach the quotation PDF.');
    }
  };

  try {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: canSharePdf });
    Object.defineProperty(navigator, 'share', { configurable: true, value: sharePdf });
  } catch (error) {
    try {
      navigator.canShare = canSharePdf;
      navigator.share = sharePdf;
    } catch (ignored) {
      console.error('Native Android PDF sharing could not be installed.', error);
    }
  }

  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const requestUrl = request ? request.url : String(input);
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    let host = '';
    try {
      host = new URL(requestUrl, window.location.href).hostname;
    } catch (error) {
      return originalFetch(input, init);
    }

    if (method !== 'PUT' || !host.endsWith('.amazonaws.com') || !host.includes('.s3')) {
      return originalFetch(input, init);
    }

    const body = init.body !== undefined ? init.body : request ? await request.clone().blob() : null;
    if (!(body instanceof Blob)) return originalFetch(input, init);

    try {
      const headers = new Headers(init.headers || request?.headers || {});
      const contentType = headers.get('Content-Type') || body.type || 'application/octet-stream';
      const encodedBody = await blobToBase64(body);
      const result = await callNative('putS3Object', [requestUrl, contentType, encodedBody]);
      return new Response(result.message || null, { status: result.status || 500 });
    } catch (error) {
      return new Response(error.message || 'Image upload failed.', { status: 500 });
    }
  };

  document.addEventListener('click', async (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (!anchor || !anchor.href.startsWith('blob:') || !anchor.download) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const blob = await originalFetch(anchor.href).then((response) => response.blob());
      const encodedBody = await blobToBase64(blob);
      const result = await callNative('saveDownload', [anchor.download, blob.type || 'application/octet-stream', encodedBody]);
      if (result.status !== 200) {
        window.AndroidTransferBridge.showTransferError(String(result.message || 'File download failed.'));
      }
    } catch (error) {
      window.AndroidTransferBridge.showTransferError(String(error.message || 'File download failed.'));
    }
  }, true);
})();