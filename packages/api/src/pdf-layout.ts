import {
  type Color,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

// The A4 statement layout shared by the agreement receipt (EXTRA-07) and the
// validation certificate (APPR-04): metadata in a left sidebar, the record
// itself in the main pane.

export const fill = (
  template: string,
  values: Record<string, string | number>
) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;
export const SIDEBAR_WIDTH = 168;
export const GUTTER = 32;
export const MAIN_X = MARGIN + SIDEBAR_WIDTH + GUTTER;
export const MAIN_WIDTH = PAGE_WIDTH - MAIN_X - MARGIN;
const FOOTER_SPACE = 64;

export const INK = rgb(0.09, 0.09, 0.11);
export const MUTED = rgb(0.42, 0.43, 0.47);
const RULE = rgb(0.88, 0.88, 0.9);

export interface BadgeColors {
  background: Color;
  text: Color;
}

const WHITESPACE = /\s+/;

export interface Fonts {
  bold: PDFFont;
  mono: PDFFont;
  regular: PDFFont;
}

export async function embedFonts(document: PDFDocument): Promise<Fonts> {
  return {
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
    regular: await document.embedFont(StandardFonts.Helvetica),
  };
}

// The standard PDF fonts only encode WinAnsi: other characters (the narrow
// spaces Intl puts in French amounts, emoji in a name) become a space or "?".
export function encodable(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string) =>
    Array.from(text, (char) => {
      const code = char.codePointAt(0) ?? 0;
      if (supported.has(code)) {
        return char;
      }
      return WHITESPACE.test(char) ? " " : "?";
    }).join("");
}

// Splits text into lines that fit `width`, breaking long words (a hash, an
// email) where they overflow.
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
      }
      line = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Writes top to bottom in one column, adding a page when it runs out.
export class Column {
  readonly #document: PDFDocument;
  readonly #sanitize: (text: string) => string;
  readonly #width: number;
  readonly #x: number;
  page: PDFPage;
  y: number;

  constructor(
    document: PDFDocument,
    page: PDFPage,
    area: { width: number; x: number; y: number },
    sanitize: (text: string) => string
  ) {
    this.#document = document;
    this.page = page;
    this.#width = area.width;
    this.#x = area.x;
    this.y = area.y;
    this.#sanitize = sanitize;
  }

  ensure(height: number) {
    if (this.y - height >= MARGIN + FOOTER_SPACE) {
      return;
    }
    this.page = this.#document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  text(
    value: string,
    style: { color?: Color; font: PDFFont; gap?: number; size: number }
  ) {
    const lineHeight = style.size * 1.35;
    for (const line of wrap(
      this.#sanitize(value),
      style.font,
      style.size,
      this.#width
    )) {
      this.ensure(lineHeight);
      this.y -= style.size;
      this.page.drawText(line, {
        color: style.color ?? INK,
        font: style.font,
        size: style.size,
        x: this.#x,
        y: this.y,
      });
      this.y -= lineHeight - style.size;
    }
    this.y -= style.gap ?? 0;
  }

  row(
    label: string,
    value: string,
    style: { font: PDFFont; size: number; strong?: boolean }
  ) {
    this.ensure(style.size * 1.6);
    this.y -= style.size;
    this.page.drawText(this.#sanitize(label), {
      color: style.strong ? INK : MUTED,
      font: style.font,
      size: style.size,
      x: this.#x,
      y: this.y,
    });
    const amount = this.#sanitize(value);
    this.page.drawText(amount, {
      color: INK,
      font: style.font,
      size: style.size,
      x:
        this.#x +
        this.#width -
        style.font.widthOfTextAtSize(amount, style.size),
      y: this.y,
    });
    this.y -= style.size * 0.6;
  }

  rule(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({
      color: RULE,
      end: { x: this.#x + this.#width, y: this.y },
      start: { x: this.#x, y: this.y },
      thickness: 0.75,
    });
    this.y -= gap;
  }

  label(value: string, fonts: Fonts) {
    this.text(value.toLocaleUpperCase(), {
      color: MUTED,
      font: fonts.bold,
      gap: 3,
      size: 7,
    });
  }

  field(
    label: string,
    value: string,
    detail: string | undefined,
    fonts: Fonts
  ) {
    this.label(label, fonts);
    this.text(value, { font: fonts.regular, gap: detail ? 1 : 10, size: 9.5 });
    if (detail) {
      this.text(detail, {
        color: MUTED,
        font: fonts.regular,
        gap: 10,
        size: 8,
      });
    }
  }
}

export function drawBadge(
  page: PDFPage,
  text: string,
  colors: BadgeColors,
  at: { font: PDFFont; x: number; y: number }
) {
  const size = 8;
  const padding = 6;
  const width = at.font.widthOfTextAtSize(text, size) + padding * 2;
  page.drawRectangle({
    color: colors.background,
    height: size + padding,
    width,
    x: at.x - width,
    y: at.y - size - padding / 2,
  });
  page.drawText(text, {
    color: colors.text,
    font: at.font,
    size,
    x: at.x - width + padding,
    y: at.y - size,
  });
}

export function drawSidebarRule(page: PDFPage) {
  page.drawLine({
    color: RULE,
    end: { x: MAIN_X - GUTTER / 2, y: MARGIN + FOOTER_SPACE },
    start: { x: MAIN_X - GUTTER / 2, y: PAGE_HEIGHT - MARGIN },
    thickness: 0.75,
  });
}

export function drawFooter(document: PDFDocument, text: string, font: PDFFont) {
  for (const page of document.getPages()) {
    page.drawText(text, {
      color: MUTED,
      font,
      size: 7,
      x: MARGIN,
      y: MARGIN,
    });
  }
}
