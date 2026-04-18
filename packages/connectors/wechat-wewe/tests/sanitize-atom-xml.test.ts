import { describe, it, expect } from "vitest";
import { sanitizeAtomXmlAggressive, sanitizeAtomXmlRaw } from "../src/sanitize-atom-xml";

describe("sanitizeAtomXmlRaw", () => {
  it("replaces messy XML declaration with a safe UTF-8 header", () => {
    const raw = `<?xml version=1.0 encoding=UTF-8 standalone=yes?><feed/>`;
    expect(sanitizeAtomXmlRaw(raw)).toBe(`<?xml version="1.0" encoding="UTF-8"?><feed/>`);
  });

  it("quotes unquoted rel and type on link elements", () => {
    const raw = `<link href="https://x" rel=alternate type=application/atom+xml/>`;
    expect(sanitizeAtomXmlRaw(raw)).toBe(
      `<link href="https://x" rel="alternate" type="application/atom+xml"/>`,
    );
  });

  it("quotes unquoted xmlns on feed", () => {
    const raw = `<feed xmlns=http://www.w3.org/2005/Atom>`;
    expect(sanitizeAtomXmlRaw(raw)).toBe(`<feed xmlns="http://www.w3.org/2005/Atom">`);
  });

  it("quotes xml-stylesheet PI attributes", () => {
    const raw = `<?xml-stylesheet type=text/xsl href=atom.xsl?>`;
    expect(sanitizeAtomXmlRaw(raw)).toBe(
      `<?xml-stylesheet type="text/xsl" href="atom.xsl"?>`,
    );
  });

  it("quotes unquoted absolute href on link", () => {
    const raw = `<link rel=self type=application/atom+xml href=http://127.0.0.1:4000/feeds/MP.atom/>`;
    expect(sanitizeAtomXmlRaw(raw)).toBe(
      `<link rel="self" type="application/atom+xml" href="http://127.0.0.1:4000/feeds/MP.atom"/>`,
    );
  });

  it("strips UTF-8 BOM before processing", () => {
    const raw = `\uFEFF<?xml version=1.0?><r/>`;
    expect(sanitizeAtomXmlRaw(raw)).toBe(`<?xml version="1.0" encoding="UTF-8"?><r/>`);
  });
});

describe("sanitizeAtomXmlAggressive", () => {
  it("strips DOCTYPE and quotes date-like attributes", () => {
    const raw = `<!DOCTYPE feed [<!ENTITY x "y">]>
<feed xmlns=http://www.w3.org/2005/Atom><e updated=2024-01-02T00:00:00Z/></feed>`;
    const out = sanitizeAtomXmlAggressive(raw);
    expect(out).not.toContain("<!DOCTYPE");
    expect(out).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(out).toContain('updated="2024-01-02T00:00:00Z"');
  });

  it("quotes generic unquoted attributes as final fallback", () => {
    const raw = `<entry data-source=wewe status=ok xml:lang=zh-CN></entry>`;
    expect(sanitizeAtomXmlAggressive(raw)).toContain(
      `<entry data-source="wewe" status="ok" xml:lang="zh-CN"></entry>`,
    );
  });
});
