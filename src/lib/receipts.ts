import { apiRequest } from './api';
import type { ReceiptUploadSignature } from './types';

const UPLOAD_TIMEOUT_MS = 60_000;

// The backend signs a short-lived upload so the Cloudinary secret never sits on the tablet;
// the image then goes straight to Cloudinary and the expense stores the returned URL.
export async function uploadReceiptImage(image: { uri: string; mimeType?: string | null; fileName?: string | null }): Promise<string> {
  const signature = await apiRequest<ReceiptUploadSignature>('POST', '/api/v1/finance/receipts/upload-signature');

  const form = new FormData();
  form.append('file', {
    uri: image.uri,
    type: image.mimeType ?? 'image/jpeg',
    name: image.fileName ?? 'receipt.jpg',
  } as unknown as Blob);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('folder', signature.folder);
  form.append('signature', signature.signature);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(signature.uploadUrl, { method: 'POST', body: form, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || typeof payload?.secure_url !== 'string') {
      throw new Error(payload?.error?.message ? `Receipt upload failed: ${payload.error.message}` : 'Receipt upload failed.');
    }

    return payload.secure_url;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Receipt upload timed out. Check the internet and try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
