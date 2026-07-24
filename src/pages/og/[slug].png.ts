// src/pages/og/[slug].png.ts
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import sharp from 'sharp';

export const getStaticPaths: GetStaticPaths = async () => {
  const articles = await getCollection('articles');
  return articles.map((article) => ({
    params: { slug: article.id },
    props: { title: article.data.title },
  }));
};

let fontData: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;
  const res = await fetch(
    'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.woff'
  );
  fontData = await res.arrayBuffer();
  return fontData;
}

export const GET: APIRoute = async ({ props }) => {
  const { title } = props as { title: string };
  const font = await loadFont();

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          backgroundColor: '#18181b',
          color: '#fafafa',
          fontFamily: 'Noto Sans JP',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { fontSize: 48, fontWeight: 700, lineHeight: 1.4, wordBreak: 'break-word' },
              children: title,
            },
          },
          {
            type: 'div',
            props: {
              style: { fontSize: 24, color: '#a1a1aa', marginTop: 'auto' },
              children: '話題まとめ',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Noto Sans JP',
          data: font,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
