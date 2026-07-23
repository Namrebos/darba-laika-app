function formatPhotoTime(date: Date) {
  return new Intl.DateTimeFormat("lv-LV", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function addPhotoTimestamp(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const fontSize = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
  const margin = Math.max(12, Math.round(fontSize * 0.8));
  context.font = `500 ${fontSize}px Arial, sans-serif`;
  context.fillStyle = "#ffffff";
  context.textAlign = "right";
  context.textBaseline = "bottom";
  const uploadedAt = new Date();
  context.fillText(formatPhotoTime(uploadedAt), canvas.width - margin, canvas.height - margin);

  const outputType = ["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ? file.type
    : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, 0.92),
  );

  if (!blob) return file;
  return new File([blob], file.name, {
    type: outputType,
    lastModified: uploadedAt.getTime(),
  });
}
