export interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color?: number;
  thumbnail?: { url: string };
}

interface NotifyOptions {
  webhookUrl: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

export async function sendDiscordNotification(options: NotifyOptions): Promise<void> {
  try {
    const res = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        embeds: options.embeds,
      }),
    });
    if (!res.ok) {
      console.error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('Failed to send Discord notification:', err);
  }
}
