/** Shrinks a photo in the browser before upload (max 800px, JPEG) so uploads stay small and fast. */
export async function resizeImage(file: File, max = 800): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be read. Try a JPEG or PNG.");
  });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't process the image");
  if (blob.size > 2 * 1024 * 1024) throw new Error("Image is still larger than 2 MB after resizing");
  return blob;
}
