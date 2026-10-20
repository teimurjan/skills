import { SITE_URL, type Lang } from "@/lib/i18n";

/**
 * The shape every email we send takes: a letter, not a layout. Unstyled paragraphs, read in the
 * client's own font like mail from a person, then a footer under a signature dash.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** One paragraph of the letter, as each of the two parts spells it. */
export interface Block {
  text: string;
  html: string;
}

export const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const say = (line: string): Block => ({ text: line, html: escape(line) });

export const link = (label: string, url: string): Block => ({
  text: `${label}: ${url}`,
  html: `<a href="${escape(url)}">${escape(label)}</a>`,
});

/** Gmail shows no SVG, so the email carries the badge as a PNG. */
export const badge = (label: string, url: string): Block => ({
  text: `${label}: ${url}`,
  html: `<a href="${escape(url)}"><img src="${SITE_URL}/badges/app-store.png" width="120" height="40" border="0" alt="${escape(label)}"></a>`,
});

export function renderLetter(lang: Lang, subject: string, letter: Block[], footer: Block[]): RenderedEmail {
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${escape(subject)}</title>
</head>
<body>
${letter.map((block) => `<p>${block.html}</p>`).join("\n")}
<p>--<br>
${footer.map((block) => block.html).join("<br>\n")}</p>
</body>
</html>`;

  const text = [
    ...letter.map((block) => block.text),
    ["--", ...footer.map((block) => block.text)].join("\n"),
  ].join("\n\n");

  return { subject, html, text };
}
