// Защита фото смены от подмены (фидбек Никиты 21.11.2026): старое фото из
// галереи получало штамп с текущим временем. Проверяем свежесть снимка (время
// файла и EXIF-время съёмки) и считаем отпечаток картинки, чтобы тот же кадр
// нельзя было прислать повторно.

/** Сколько может пройти между съёмкой и прикреплением. */
export const MAX_PHOTO_AGE_MS = 5 * 60 * 1000;

/** Время съёмки из EXIF (DateTimeOriginal, иначе DateTime) — локальное время телефона. */
export function readExifDate(buf: ArrayBuffer): Date | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10;
      const little = v.getUint16(tiff) === 0x4949;
      const u16 = (p: number) => v.getUint16(p, little);
      const u32 = (p: number) => v.getUint32(p, little);
      const readAscii = (p: number, n: number) => {
        let s = "";
        for (let i = 0; i < n && p + i < v.byteLength; i++) {
          const c = v.getUint8(p + i);
          if (!c) break;
          s += String.fromCharCode(c);
        }
        return s;
      };
      const findTag = (ifd: number, tag: number): number | null => {
        if (ifd + 2 > v.byteLength) return null;
        const n = u16(ifd);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > v.byteLength) return null;
          if (u16(e) === tag) return e;
        }
        return null;
      };
      const ifd0 = tiff + u32(tiff + 4);
      let str: string | null = null;
      const exifPtr = findTag(ifd0, 0x8769);
      if (exifPtr !== null) {
        const exifIfd = tiff + u32(exifPtr + 8);
        const e = findTag(exifIfd, 0x9003);
        if (e !== null) str = readAscii(tiff + u32(e + 8), 19);
      }
      if (!str) {
        const e = findTag(ifd0, 0x0132);
        if (e !== null) str = readAscii(tiff + u32(e + 8), 19);
      }
      const m = str?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (!m) return null;
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
    if ((marker & 0xff00) !== 0xff00) break;
    off += 2 + size;
  }
  return null;
}

/** Почему снимок не подходит (или null, если подходит). */
export function staleReason(file: File, exif: Date | null, now = Date.now()): string | null {
  const tooOld = (t: number) => now - t > MAX_PHOTO_AGE_MS;
  if (exif && tooOld(exif.getTime())) {
    return `Это фото снято ${exif.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. Нужен новый снимок — сфотографируйте сейчас камерой.`;
  }
  if (file.lastModified && tooOld(file.lastModified)) {
    return "Похоже, это фото из галереи, а не новый снимок. Сфотографируйте сейчас камерой.";
  }
  return null;
}

/** dHash 64 бита (16 hex-символов) — устойчив к сжатию и небольшим изменениям. */
export function dHash(img: HTMLImageElement | HTMLCanvasElement): string {
  const c = document.createElement("canvas");
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  };
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray(x, y) > gray(x + 1, y) ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}
