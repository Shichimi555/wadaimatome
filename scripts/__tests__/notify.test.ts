import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendDiscordNotification } from '../notify';

describe('sendDiscordNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST JSON payload to webhook URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));

    await sendDiscordNotification({
      webhookUrl: 'https://discord.com/api/webhooks/test',
      content: 'Hello',
      embeds: [{ title: 'Test', description: 'Body', color: 0x3b82f6 }],
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/test');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init?.body as string);
    expect(body.content).toBe('Hello');
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe('Test');
  });

  it('should not throw on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendDiscordNotification({
        webhookUrl: 'https://discord.com/api/webhooks/test',
        content: 'Hello',
      })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('should log warning on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 429 }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendDiscordNotification({
      webhookUrl: 'https://discord.com/api/webhooks/test',
      content: 'Hello',
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
