function formatPhotoTime(date: Date) {
  return new Intl.DateTimeFormat("lv-LV", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

const digitSegments: Record<string, number[]> = {
  "0": [0, 1, 2, 4, 5, 6],
  "1": [2, 5],
  "2": [0, 2, 3, 4, 6],
  "3": [0, 2, 3, 5, 6],
  "4": [1, 2, 3, 5],
  "5": [0, 1, 3, 5, 6],
  "6": [0, 1, 3, 4, 5, 6],
  "7": [0, 2, 5],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 5, 6],
};

function drawDigitalTime(
  context: CanvasRenderingContext2D,
  text: string,
  right: number,
  bottom: number,
  height: number,
) {
  const thickness = Math.max(3, Math.round(height * 0.11));
  const digitWidth = Math.round(height * 0.58);
  const gap = Math.round(thickness * 0.75);
  const colonWidth = Math.round(thickness * 1.6);
  const characterWidths = [...text].map((character) =>
    character === ":" ? colonWidth : digitWidth,
  );
  const totalWidth =
    characterWidths.reduce((sum, width) => sum + width, 0) +
    gap * (text.length - 1);
  let x = right - totalWidth;
  const y = bottom - height;
  const half = Math.round(height / 2);

  context.fillStyle = "#7CFF6B";

  [...text].forEach((character, index) => {
    if (character === ":") {
      const dotSize = thickness;
      context.fillRect(x, y + Math.round(height * 0.3), dotSize, dotSize);
      context.fillRect(x, y + Math.round(height * 0.68), dotSize, dotSize);
    } else {
      const segments = digitSegments[character] || [];
      const horizontalWidth = digitWidth - thickness;
      const verticalHeight = half - thickness;
      const positions = [
        [x, y, horizontalWidth, thickness],
        [x, y, thickness, verticalHeight],
        [x + digitWidth - thickness, y, thickness, verticalHeight],
        [x, y + half - Math.round(thickness / 2), horizontalWidth, thickness],
        [x, y + half, thickness, verticalHeight],
        [x + digitWidth - thickness, y + half, thickness, verticalHeight],
        [x, y + height - thickness, horizontalWidth, thickness],
      ];

      segments.forEach((segment) => {
        const [segmentX, segmentY, width, segmentHeight] = positions[segment];
        context.fillRect(segmentX, segmentY, width, segmentHeight);
      });
    }

    x += characterWidths[index] + gap;
  });
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

  const digitHeight = Math.max(
    28,
    Math.round(Math.min(canvas.width, canvas.height) * 0.05),
  );
  const margin = Math.max(16, Math.round(digitHeight * 0.65));
  const uploadedAt = new Date();
  drawDigitalTime(
    context,
    formatPhotoTime(uploadedAt),
    canvas.width - margin,
    canvas.height - margin,
    digitHeight,
  );

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
