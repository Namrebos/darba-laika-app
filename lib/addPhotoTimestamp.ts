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

function fillPolygon(
  context: CanvasRenderingContext2D,
  points: [number, number][],
) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fill();
}

function drawHorizontalSegment(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  thickness: number,
) {
  const bevel = Math.round(thickness * 0.48);
  fillPolygon(context, [
    [x + bevel, y],
    [x + width - bevel, y],
    [x + width, y + bevel],
    [x + width - bevel, y + thickness],
    [x + bevel, y + thickness],
    [x, y + bevel],
  ]);
}

function drawVerticalSegment(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  thickness: number,
  height: number,
) {
  const bevel = Math.round(thickness * 0.48);
  fillPolygon(context, [
    [x + bevel, y],
    [x + thickness, y + bevel],
    [x + thickness, y + height - bevel],
    [x + bevel, y + height],
    [x, y + height - bevel],
    [x, y + bevel],
  ]);
}

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

  [...text].forEach((character, index) => {
    if (character === ":") {
      const dotSize = thickness;
      context.fillStyle = "#7CFF4F";
      context.fillRect(x, y + Math.round(height * 0.3), dotSize, dotSize);
      context.fillRect(x, y + Math.round(height * 0.68), dotSize, dotSize);
    } else {
      const activeSegments = new Set(digitSegments[character] || []);
      const horizontalWidth = digitWidth - Math.round(thickness * 0.35);
      const verticalHeight = half - Math.round(thickness * 0.7);
      const positions: {
        direction: "horizontal" | "vertical";
        x: number;
        y: number;
        width: number;
        height: number;
      }[] = [
        { direction: "horizontal", x, y, width: horizontalWidth, height: thickness },
        { direction: "vertical", x, y: y + Math.round(thickness * 0.35), width: thickness, height: verticalHeight },
        { direction: "vertical", x: x + digitWidth - thickness, y: y + Math.round(thickness * 0.35), width: thickness, height: verticalHeight },
        { direction: "horizontal", x, y: y + half - Math.round(thickness / 2), width: horizontalWidth, height: thickness },
        { direction: "vertical", x, y: y + half + Math.round(thickness * 0.15), width: thickness, height: verticalHeight },
        { direction: "vertical", x: x + digitWidth - thickness, y: y + half + Math.round(thickness * 0.15), width: thickness, height: verticalHeight },
        { direction: "horizontal", x, y: y + height - thickness, width: horizontalWidth, height: thickness },
      ];

      positions.forEach((position, segment) => {
        context.fillStyle = activeSegments.has(segment)
          ? "#7CFF4F"
          : "rgba(0, 48, 0, 0.52)";
        if (position.direction === "horizontal") {
          drawHorizontalSegment(
            context,
            position.x,
            position.y,
            position.width,
            position.height,
          );
        } else {
          drawVerticalSegment(
            context,
            position.x,
            position.y,
            position.width,
            position.height,
          );
        }
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
