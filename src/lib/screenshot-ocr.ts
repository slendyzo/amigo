import Tesseract from "tesseract.js";
import { parseScreenshotText, screenshotExpenseConfidence, type ScreenshotExpense } from "./screenshot-parser";

/** Images stay in the browser; only reviewed expense fields are sent when saving. */
export async function extractScreenshotExpenses(
  file: File,
  captureDate: string,
  defaultCurrency: string,
  onProgress?: (progress: number) => void,
): Promise<{ expenses: ScreenshotExpense[]; rawText: string }> {
  // Notification text is small and often white on translucent dark cards.
  // Upscaling and inversion recover punctuation that otherwise disappears.
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, 3200 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("Image processing unavailable"); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = 255 - Math.round(pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
  }
  context.putImageData(pixels, 0, 0);
  const worker = await Tesseract.createWorker("eng+por", 1, {
    logger: message => {
      if (message.status === "recognizing text") onProgress?.(Math.round(message.progress * 100));
    },
  });
  try {
    const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const rawText = result.data.text;
    const lines = (result.data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines));
    return { expenses: parseScreenshotText(rawText, captureDate, defaultCurrency).map(expense => ({
      ...expense,
      confidence: screenshotExpenseConfidence(expense, lines),
    })), rawText };
  } finally {
    await worker.terminate();
  }
}
