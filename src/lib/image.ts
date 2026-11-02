/**
 * Turns a phone photo into a small square JPEG before upload.
 * Re-drawing it on a canvas also strips hidden photo data like GPS location.
 */
export async function squarePhoto(file: File, size = 384): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a photo file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is too big. Pick one under 15 MB.');

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that photo. Try a JPEG or PNG.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Couldn't process that photo.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo."))), 'image/jpeg', 0.85),
  );
}
