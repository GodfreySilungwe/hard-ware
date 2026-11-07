const getAndroidSaveFunction = () => {
  if (typeof window === 'undefined') return null;
  return window.saveBlobToAndroidDocuments;
};

export const isNativeAndroidApp = () => typeof getAndroidSaveFunction() === 'function';

export const saveBlobToAndroidDocuments = async (blob, filename) => {
  const saveFile = getAndroidSaveFunction();
  if (typeof saveFile !== 'function') {
    throw new Error('Android document storage is unavailable.');
  }

  const savedFile = await saveFile(blob, filename);
  if (!Number.isFinite(savedFile?.size) || savedFile.size <= 0 || savedFile.size !== blob.size) {
    throw new Error('The saved export could not be verified.');
  }
  return savedFile;
};