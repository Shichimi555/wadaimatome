export async function fetchOgImage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; WadaimatomeBot/1.0)',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();
    const match =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );
    return match ? match[1] : '';
  } catch {
    return '';
  }
}
