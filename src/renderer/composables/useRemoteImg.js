export async function cacheRemoteImage(filename) {
  const localPath = await window.api.cacheImage(filename);
  return localPath;
}