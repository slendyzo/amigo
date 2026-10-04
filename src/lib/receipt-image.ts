import { Receipt } from './receipt-data';
import { buildReceiptLayout } from './receipt-layout';

/** Same continuous layout as PDF; large receipts use 2x raster resolution. */
export async function renderReceiptImages(receipt: Receipt, mimeType = 'image/jpeg'): Promise<Blob[]> {
  if (!['image/jpeg', 'image/png'].includes(mimeType)) throw new Error('INVALID_RECEIPT_IMAGE_TYPE');
  const layout = buildReceiptLayout(receipt);
  const scale = layout.height * 3 <= 16_384 ? 3 : 2;
  if (layout.height * scale > 16_384) throw new Error('RECEIPT_TOO_TALL');
  const canvas = document.createElement('canvas');
  canvas.width = layout.width * scale;
  canvas.height = Math.ceil(layout.height * scale);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('RECEIPT_CANVAS_UNAVAILABLE');
    context.scale(scale, scale);
    context.fillStyle = layout.paper;
    context.fillRect(0, 0, layout.width, layout.height);
    for (const command of layout.commands) {
      if (command.kind === 'text') {
        context.font = `${command.bold ? '700' : '400'} ${command.size}px "Courier New", Courier, monospace`;
        context.textBaseline = 'alphabetic';
        context.fillStyle = command.color;
        context.fillText(command.text, command.x, command.y + command.size * 0.629);
        if (command.strike) {
          context.save(); context.strokeStyle = command.color; context.lineWidth = 0.6;
          context.beginPath(); context.moveTo(command.x, command.y + command.size * 0.34);
          context.lineTo(command.x + Array.from(command.text).length * command.size * 0.6, command.y + command.size * 0.34);
          context.stroke(); context.restore();
        }
      } else if (command.kind === 'rule') {
        context.save(); context.strokeStyle = '#77776c'; context.lineWidth = 0.5; context.setLineDash([2, 3]);
        context.beginPath(); context.moveTo(24, command.y); context.lineTo(layout.width - 24, command.y); context.stroke(); context.restore();
      } else { context.fillStyle = '#252520'; context.fillRect(command.x, command.y, command.width, command.height); }
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('RECEIPT_IMAGE_FAILED')), mimeType, 0.95));
    return [blob];
  } finally { canvas.width = 0; canvas.height = 0; }
}
