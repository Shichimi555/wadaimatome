import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOgImage } from '../ogimage';

describe('fetchOgImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract og:image from HTML (property before content)', async () => {
    const html = '<html><head><meta property="og:image" content="https://example.com/image.jpg"></head></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));
    const result = await fetchOgImage('https://example.com');
    expect(result).toBe('https://example.com/image.jpg');
  });

  it('should extract og:image from HTML (content before property)', async () => {
    const html = '<html><head><meta content="https://example.com/photo.png" property="og:image"></head></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));
    const result = await fetchOgImage('https://example.com');
    expect(result).toBe('https://example.com/photo.png');
  });

  it('should return empty string when no og:image found', async () => {
    const html = '<html><head><title>No OG</title></head></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));
    const result = await fetchOgImage('https://example.com');
    expect(result).toBe('');
  });

  it('should return empty string on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    const result = await fetchOgImage('https://example.com');
    expect(result).toBe('');
  });

  it('should return empty string on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));
    const result = await fetchOgImage('https://example.com');
    expect(result).toBe('');
  });
});
