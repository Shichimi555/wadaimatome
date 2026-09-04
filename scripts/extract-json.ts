/**
 * Pulls the first complete JSON object out of a model response.
 *
 * The model is asked for bare JSON but does not always comply: it prefixes a
 * headline, appends a closing remark, or emits a second object. A greedy
 * /\{[\s\S]*\}/ spans from the first brace to the last one and hands JSON.parse
 * something it rejects, so a response we already paid for is thrown away.
 * Scanning for the matching brace keeps the part that is valid.
 */
export function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }

  return null;
}
