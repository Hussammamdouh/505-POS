import createQrCode from 'qrcode-generator';

// Receipts are drawn as one black-and-white image on the iPad, then sent with ESC/POS GS v 0.
// This gives a proper font and layout (the printer's built-in font is a fixed-width typewriter
// face), and needs nothing but the bundled glyphs and logos, so it works offline.

const ESC = 0x1b;
const GS = 0x1d;

/** A 1-bit image: rows of width/8 bytes, most significant bit first, 1 = ink. */
export interface RasterImage {
  width: number;
  height: number;
  /** Base64 of the packed rows. */
  data: string;
}

/** Glyph bitmaps made by tools/receipt-fonts.mjs. */
export interface BitmapFont {
  lineHeight: number;
  ascent: number;
  /** [char code, advance x100, x offset, y offset, width, height, byte offset] */
  index: number[][];
  data: string;
}

interface Glyph {
  advance: number;
  x: number;
  y: number;
  width: number;
  height: number;
  offset: number;
}

interface LoadedFont {
  glyphs: Map<number, Glyph>;
  bits: Uint8Array;
  lineHeight: number;
  ascent: number;
}

const loadedFonts = new WeakMap<BitmapFont, LoadedFont>();

function load(font: BitmapFont): LoadedFont {
  let loaded = loadedFonts.get(font);
  if (!loaded) {
    const glyphs = new Map<number, Glyph>();
    for (const [code, advance, x, y, width, height, offset] of font.index) {
      glyphs.set(code, { advance: advance / 100, x, y, width, height, offset });
    }

    // Poppins has tall built-in line spacing; receipts read better a little tighter.
    loaded = { glyphs, bits: decodeBase64(font.data), lineHeight: Math.round(font.lineHeight * 0.86), ascent: font.ascent };
    loadedFonts.set(font, loaded);
  }

  return loaded;
}

const glyphOf = (font: LoadedFont, character: string): Glyph =>
  font.glyphs.get(character.charCodeAt(0)) ?? font.glyphs.get(0x3f)!;

/** Blank space kept at each side of text, in dots. */
const MARGIN = 10;

export type Align = 'left' | 'center' | 'right';

export interface TextOptions {
  align?: Align;
  /** Dots from the left edge. */
  indent?: number;
  /** Extra indent for wrapped lines, so a long name lines up under itself. */
  hang?: number;
}

export class ReceiptCanvas {
  readonly width: number;
  private readonly bytesPerRow: number;
  private rows: Uint8Array[] = [];
  /** Top of the next thing to draw, in dots. */
  y = 0;

  constructor(widthDots: number) {
    this.width = Math.floor(widthDots / 8) * 8;
    this.bytesPerRow = this.width / 8;
  }

  measure(text: string, font: BitmapFont): number {
    const loaded = load(font);
    let width = 0;
    for (const character of text) {
      width += glyphOf(loaded, character).advance;
    }

    return Math.round(width);
  }

  lineHeight(font: BitmapFont): number {
    return load(font).lineHeight;
  }

  /** Draws one line of text with its top at y; returns the width. */
  drawText(text: string, x: number, y: number, font: BitmapFont, white = false): number {
    const loaded = load(font);
    let pen = x;
    for (const character of text) {
      const glyph = glyphOf(loaded, character);
      const rowBytes = Math.ceil(glyph.width / 8);
      for (let gy = 0; gy < glyph.height; gy++) {
        for (let gx = 0; gx < glyph.width; gx++) {
          if (loaded.bits[glyph.offset + gy * rowBytes + (gx >> 3)] & (0x80 >> (gx & 7))) {
            this.setPixel(Math.round(pen) + glyph.x + gx, y + glyph.y + gy, !white);
          }
        }
      }

      pen += glyph.advance;
    }

    return Math.round(pen - x);
  }

  wrap(text: string, font: BitmapFont, maxWidth: number, hangWidth = 0): string[] {
    const lines: string[] = [];
    // Every line after the first is indented by hangWidth, so it has less room.
    const room = () => (lines.length === 0 ? maxWidth : maxWidth - hangWidth);
    for (const paragraph of clean(text).split('\n')) {
      let current = '';
      for (const word of paragraph.split(' ').filter((part) => part.length > 0)) {
        const candidate = current ? `${current} ${word}` : word;
        if (this.measure(candidate, font) <= room()) {
          current = candidate;
          continue;
        }

        if (current) {
          lines.push(current);
        }

        current = this.breakLongWord(word, font, room, lines);
      }

      lines.push(current);
    }

    return lines;
  }

  text(text: string, font: BitmapFont, options: TextOptions = {}): this {
    const indent = options.indent ?? 0;
    const hang = options.hang ?? 0;
    const height = this.lineHeight(font);
    this.wrap(text, font, this.width - MARGIN * 2 - indent, hang).forEach((line, index) => {
      const lineWidth = this.measure(line, font);
      const left = MARGIN + indent + (index > 0 ? hang : 0);
      const x =
        options.align === 'center'
          ? Math.round((this.width - lineWidth) / 2)
          : options.align === 'right'
            ? this.width - MARGIN - lineWidth
            : left;
      this.drawText(line, x, this.y, font);
      this.y += height;
    });

    return this;
  }

  /** Left text with right-aligned text on its first line; the left side wraps before the right. */
  row(left: string, right: string, font: BitmapFont, options: Omit<TextOptions, 'align'> & { rightFont?: BitmapFont } = {}): this {
    const rightFont = options.rightFont ?? font;
    const indent = options.indent ?? 0;
    const hang = options.hang ?? 0;
    const rightText = clean(right);
    const rightWidth = this.measure(rightText, rightFont);
    const height = Math.max(this.lineHeight(font), this.lineHeight(rightFont));
    const lines = this.wrap(left, font, this.width - MARGIN * 2 - indent - rightWidth - (rightWidth > 0 ? 16 : 0), hang);

    // Line up the baselines when the two sides use different sizes.
    const leftAscent = load(font).ascent;
    const rightAscent = load(rightFont).ascent;
    this.drawText(rightText, this.width - MARGIN - rightWidth, this.y + Math.max(0, leftAscent - rightAscent), rightFont);
    lines.forEach((line, index) => {
      this.drawText(line, MARGIN + indent + (index > 0 ? hang : 0), this.y + Math.max(0, rightAscent - leftAscent), font);
      this.y += index === 0 ? height : this.lineHeight(font);
    });

    return this;
  }

  /** White text centred on a black bar across the paper. */
  bar(text: string, font: BitmapFont, padding = 8): this {
    const lines = this.wrap(text, font, this.width - 32);
    const height = this.lineHeight(font);
    this.fillRect(0, this.y, this.width, lines.length * height + padding * 2);
    this.y += padding;
    for (const line of lines) {
      this.drawText(line, Math.round((this.width - this.measure(line, font)) / 2), this.y, font, true);
      this.y += height;
    }

    this.y += padding;
    return this;
  }

  /** Text centred inside a black box with rounded corners (white text) or an outline. */
  badge(text: string, font: BitmapFont, filled: boolean, padX = 28, padY = 6): this {
    const line = clean(text);
    const textWidth = this.measure(line, font);
    const width = Math.min(this.width, textWidth + padX * 2);
    const height = this.lineHeight(font) + padY * 2;
    const x = Math.round((this.width - width) / 2);
    this.roundedBox(x, this.y, width, height, filled);
    this.drawText(line, x + Math.round((width - textWidth) / 2), this.y + padY, font, filled);
    this.y += height;
    return this;
  }

  rule(style: 'solid' | 'double' | 'dashed' | 'dotted' = 'dashed', spacing = 10): this {
    this.y += spacing;
    const line = (y: number, thickness: number, on: number, off: number) => {
      for (let x = 0; x < this.width; x++) {
        if (off === 0 || x % (on + off) < on) {
          for (let t = 0; t < thickness; t++) {
            this.setPixel(x, y + t, true);
          }
        }
      }
    };

    if (style === 'double') {
      line(this.y, 3, 1, 0);
      line(this.y + 6, 3, 1, 0);
      this.y += 9;
    } else if (style === 'solid') {
      line(this.y, 3, 1, 0);
      this.y += 3;
    } else if (style === 'dashed') {
      line(this.y, 2, 12, 8);
      this.y += 2;
    } else {
      line(this.y, 2, 3, 6);
      this.y += 2;
    }

    this.y += spacing;
    return this;
  }

  gap(dots: number): this {
    this.y += dots;
    return this;
  }

  /** Draws an image centred across the paper and moves below it. */
  image(image: RasterImage): this {
    this.drawImage(image, Math.round((this.width - image.width) / 2), this.y);
    this.y += image.height;
    return this;
  }

  drawImage(image: RasterImage, left: number, top: number) {
    const data = decodeBase64(image.data);
    const imageBytesPerRow = image.width / 8;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (data[y * imageBytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) {
          this.setPixel(left + x, top + y, true);
        }
      }
    }
  }

  /** Draws a QR code with its top-left corner at (left, top); returns its size in dots. */
  drawQrCode(data: string, left: number, top: number, moduleDots: number): number {
    const code = createQrCode(0, 'M');
    code.addData(data);
    code.make();
    const count = code.getModuleCount();
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        if (code.isDark(row, column)) {
          this.fillRect(left + column * moduleDots, top + row * moduleDots, moduleDots, moduleDots);
        }
      }
    }

    return count * moduleDots;
  }

  /** Size a QR code for this data would take, without drawing it. */
  qrCodeSize(data: string, moduleDots: number): number {
    const code = createQrCode(0, 'M');
    code.addData(data);
    code.make();
    return code.getModuleCount() * moduleDots;
  }

  /** A box with rounded corners: solid black, or a 4-dot outline. */
  roundedBox(x: number, y: number, width: number, height: number, filled: boolean) {
    const radius = Math.min(18, Math.floor(height / 3));
    const border = 4;
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const outer = insideRoundedRect(dx, dy, width, height, radius);
        const inner = insideRoundedRect(dx - border, dy - border, width - border * 2, height - border * 2, radius - border);
        if (outer && (filled || !inner)) {
          this.setPixel(x + dx, y + dy, true);
        }
      }
    }
  }

  /** Draws a line of text centred between two x positions. */
  drawCentered(text: string, font: BitmapFont, left: number, right: number, top: number, white = false) {
    const line = clean(text);
    this.drawText(line, left + Math.round((right - left - this.measure(line, font)) / 2), top, font, white);
  }

  fillRect(x: number, y: number, width: number, height: number) {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) {
        this.setPixel(column, row, true);
      }
    }
  }

  /** The image as printer bytes: reset, the raster in bands, feed and cut. */
  toEscPos(): Uint8Array {
    const height = Math.max(1, this.y);
    const bandRows = 128;
    const chunks: number[][] = [[ESC, 0x40]];
    for (let top = 0; top < height; top += bandRows) {
      const rows = Math.min(bandRows, height - top);
      const band = [GS, 0x76, 0x30, 0x00, this.bytesPerRow & 0xff, this.bytesPerRow >> 8, rows & 0xff, rows >> 8];
      chunks.push(band);
      for (let y = top; y < top + rows; y++) {
        const row = this.rows[y];
        chunks.push(row ? Array.from(row) : new Array<number>(this.bytesPerRow).fill(0));
      }
    }

    // ESC d 4 feeds four lines so the end clears the cutter; GS V 66 0 then does a partial cut.
    chunks.push([ESC, 0x64, 0x04, GS, 0x56, 0x42, 0x00]);
    const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private setPixel(x: number, y: number, ink: boolean) {
    if (x < 0 || x >= this.width || y < 0) {
      return;
    }

    while (this.rows.length <= y) {
      this.rows.push(new Uint8Array(this.bytesPerRow));
    }

    if (ink) {
      this.rows[y][x >> 3] |= 0x80 >> (x & 7);
    } else {
      this.rows[y][x >> 3] &= ~(0x80 >> (x & 7));
    }
  }

  private breakLongWord(word: string, font: BitmapFont, room: () => number, lines: string[]): string {
    let current = '';
    for (const character of word) {
      if (current && this.measure(current + character, font) > room()) {
        lines.push(current);
        current = '';
      }

      current += character;
    }

    return current;
  }
}

function insideRoundedRect(x: number, y: number, width: number, height: number, radius: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }

  const cornerX = x < radius ? radius - x : x >= width - radius ? x - (width - radius - 1) : 0;
  const cornerY = y < radius ? radius - y : y >= height - radius ? y - (height - radius - 1) : 0;
  return cornerX === 0 || cornerY === 0 || Math.hypot(cornerX, cornerY) <= radius;
}

const SUPPORTED = /[\x20-\x7e×•–]/;

/** Characters the bundled font doesn't have (e.g. Arabic) print as a single "?" per run. */
function clean(text: string): string {
  let result = '';
  let lastWasReplacement = false;
  for (const character of text.replace(/\r/g, '')) {
    if (character === '\n' || SUPPORTED.test(character)) {
      result += character;
      lastWasReplacement = false;
    } else if (!lastWasReplacement) {
      result += '?';
      lastWasReplacement = true;
    }
  }

  return result;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const result = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of clean) {
    buffer = (buffer << 6) | BASE64.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result[offset++] = (buffer >> bits) & 0xff;
    }
  }

  return result;
}
