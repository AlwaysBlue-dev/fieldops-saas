import { BadRequestException } from '@nestjs/common';
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from '../common/constants.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function decodeImagePayload(contentBase64: string) {
  const raw = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    throw new BadRequestException('Image payload is not valid base64');
  }
  if (buffer.length < 12) {
    throw new BadRequestException('Image payload is empty');
  }
  if (buffer.length > PHOTO_MAX_BYTES) {
    throw new BadRequestException('Image exceeds the 8 MB limit');
  }
  return buffer;
}

export function detectImageMime(buffer: Buffer) {
  if (buffer.subarray(0, 3).equals(JPEG)) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 4).equals(PNG)) {
    return 'image/png';
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new BadRequestException('Only JPEG, PNG, or WebP images are accepted');
}

export function assertAllowedImageMime(mimeType: string) {
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new BadRequestException('Only JPEG, PNG, or WebP images are accepted');
  }
}

export function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim().replace(/[/\\]/g, '') || 'photo';
  return trimmed.slice(0, 180);
}

export function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
