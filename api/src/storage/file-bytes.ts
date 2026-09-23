import { BadRequestException } from '@nestjs/common';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
  SIGNATURE_MIME_TYPES,
} from '../common/constants.js';
import { JobFileType } from '../generated/prisma/client.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function decodeBase64Payload(content: string, maxBytes: number) {
  const raw = content.includes(',')
    ? content.slice(content.indexOf(',') + 1)
    : content;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    throw new BadRequestException('File payload is not valid base64');
  }
  if (buffer.length < 8) {
    throw new BadRequestException('File payload is empty');
  }
  if (buffer.length > maxBytes) {
    throw new BadRequestException('File exceeds the allowed size');
  }
  return buffer;
}

export function detectObjectMime(buffer: Buffer) {
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
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf';
  }
  throw new BadRequestException('This file type is not allowed');
}

export function allowedMimesFor(type: JobFileType): readonly string[] {
  if (type === JobFileType.PHOTO) return PHOTO_MIME_TYPES;
  if (type === JobFileType.SIGNATURE) return SIGNATURE_MIME_TYPES;
  return DOCUMENT_MIME_TYPES;
}

export function maxBytesFor(type: JobFileType) {
  return type === JobFileType.DOCUMENT || type === JobFileType.OTHER
    ? DOCUMENT_MAX_BYTES
    : PHOTO_MAX_BYTES;
}

export function assertAllowedMime(type: JobFileType, mimeType: string) {
  if (!allowedMimesFor(type).includes(mimeType)) {
    throw new BadRequestException('This file type is not allowed');
  }
}

export function sanitizeOriginalName(fileName: string, fallback = 'file') {
  const trimmed = fileName.trim().replace(/[/\\]/g, '') || fallback;
  return trimmed.slice(0, 180);
}

export function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'jpg';
}

export function categoryFolder(type: JobFileType) {
  if (type === JobFileType.PHOTO) return 'photos' as const;
  if (type === JobFileType.SIGNATURE) return 'signatures' as const;
  if (type === JobFileType.DOCUMENT) return 'documents' as const;
  return 'other' as const;
}
