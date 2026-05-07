import { deflateSync } from 'node:zlib';

export function createSolidPngBase64(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): string {
  const bytesPerPixel = 4;
  const scanlineLength = 1 + width * bytesPerPixel;
  const raw = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * scanlineLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
      raw[pixelOffset] = rgba[0];
      raw[pixelOffset + 1] = rgba[1];
      raw[pixelOffset + 2] = rgba[2];
      raw[pixelOffset + 3] = rgba[3];
    }
  }

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', createIhdr(width, height)),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function createIhdr(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
