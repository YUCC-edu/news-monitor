/**
 * WeWe / some Atom generators emit XML that strict sax rejects
 * (e.g. unquoted attributes in the declaration, on <link>, <feed>, or PI).
 * Normalize common cases before xml2js.
 */

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Remove `<!DOCTYPE …>` including internal subset `[ … ]` (handles `>` inside quoted strings). */
function stripDocTypeDeclarations(xml: string): string {
  let out = "";
  let i = 0;
  const lower = xml.toLowerCase();
  while (i < xml.length) {
    const idx = lower.indexOf("<!doctype", i);
    if (idx === -1) {
      out += xml.slice(i);
      break;
    }
    out += xml.slice(i, idx);
    let j = idx + 9;
    let bracket = 0;
    let inQuote: '"' | "'" | null = null;
    while (j < xml.length) {
      const c = xml[j]!;
      if (inQuote) {
        if (c === inQuote) inQuote = null;
        j += 1;
        continue;
      }
      if (c === '"' || c === "'") {
        inQuote = c;
        j += 1;
        continue;
      }
      if (c === "[") bracket += 1;
      else if (c === "]") bracket -= 1;
      else if (c === ">" && bracket <= 0) {
        j += 1;
        break;
      }
      j += 1;
    }
    i = j;
  }
  return out;
}

/** First pass: fix common WeWe / bad Atom issues. */
export function sanitizeAtomXmlRaw(xml: string): string {
  let s = stripUtf8Bom(xml);
  // Real XML declaration is `<?xml ` … `?>` — must not match `<?xml-stylesheet`.
  s = s.replace(/<\?xml\s[\s\S]*?\?>/i, '<?xml version="1.0" encoding="UTF-8"?>');
  // <?xml-stylesheet type=text/xsl href=feed.xsl?>
  s = s.replace(/<\?xml-stylesheet\b([^?]*)\?>/gi, (_m, inner: string) => {
    const t = inner
      .replace(/\btype=([^"'\s?]+)/gi, 'type="$1"')
      .replace(/\bhref=([^"'\s?]+)/gi, 'href="$1"');
    return `<?xml-stylesheet${t}?>`;
  });
  // URL-ish attrs: end at `>`, space (next attr), or `/>` — not at the first `/` of a path.
  const urlTail = String.raw`(?=\s*\/>|[\s>])`;
  s = s.replace(new RegExp(`\\bxmlns=(https?:\\/\\/[^\\s"'>]+?)${urlTail}`, "gi"), 'xmlns="$1"');
  s = s.replace(
    new RegExp(`\\bxmlns:([A-Za-z0-9]+)=(https?:\\/\\/[^\\s"'>]+?)${urlTail}`, "gi"),
    'xmlns:$1="$2"',
  );
  s = s.replace(new RegExp(`\\bhref=(https?:\\/\\/[^\\s"'<>]+?)${urlTail}`, "gi"), 'href="$1"');
  s = s.replace(/\bxml:lang=([^"'\s>]+)(?=[\s/>])/gi, 'xml:lang="$1"');
  s = s.replace(new RegExp(`\\bxml:base=(https?:\\/\\/[^\\s"'<>]+?)${urlTail}`, "gi"), 'xml:base="$1"');
  s = s.replace(/\brel=([A-Za-z][A-Za-z0-9._-]*)(?=[\s/>])/g, 'rel="$1"');
  s = s.replace(/\btype=([a-z][a-z0-9]*\/[a-z0-9.+-]+)(?=[\s/>])/gi, 'type="$1"');
  s = s.replace(/\bterm=([^"'\s>/]+)(?=[\s/>])/g, 'term="$1"');
  s = s.replace(new RegExp(`\\bscheme=(https?:\\/\\/[^\\s"'<>]+?)${urlTail}`, "gi"), 'scheme="$1"');
  return s;
}

/**
 * Second pass after parse failure: strip DOCTYPE (can confuse sax) and quote
 * common unquoted ISO date/time attributes seen in broken Atom.
 */
export function sanitizeAtomXmlAggressive(xml: string): string {
  let s = sanitizeAtomXmlRaw(xml);
  s = stripDocTypeDeclarations(s);
  // ISO date/time values only (avoid swallowing `/` before `/>`).
  const isoVal = String.raw`\d{4}-\d{2}-\d{2}(?:T[\d:.\-+Z]+)?`;
  s = s.replace(
    new RegExp(`\\b(updated|published|issued|modified|created)=(${isoVal})(?=[\\s/>])`, "gi"),
    '$1="$2"',
  );
  s = s.replace(
    new RegExp(`\\b(dc:\\w+)=(${isoVal})(?=[\\s/>])`, "gi"),
    '$1="$2"',
  );
  // Final fallback: quote any still-unquoted attribute token values.
  // Example: foo=bar, xml:lang=zh-CN, standalone=yes, rel=alternate
  // Skip values that already start with quote.
  s = s.replace(
    /(\s[\w:.-]+)=([^\s"'=<>`]+)(?=[\s/>])/g,
    (_m, name: string, val: string) => `${name}="${val}"`,
  );
  return s;
}
