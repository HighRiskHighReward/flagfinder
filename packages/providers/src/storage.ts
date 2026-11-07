import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Magic-byte sniffing — never trust a client-declared content type. */
export function sniffMime(buf: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | null {
  const b = (i: number) => buf[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  return null;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type UploadCheck = { ok: true; mime: string; sha256: string } | { ok: false; reason: string };

export function checkUpload(buf: Uint8Array): UploadCheck {
  if (buf.byteLength === 0) return { ok: false, reason: "empty file" };
  if (buf.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: `file larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` };
  const mime = sniffMime(buf);
  if (!mime) return { ok: false, reason: "unsupported file type (allowed: PNG, JPEG, WebP, PDF)" };
  return { ok: true, mime, sha256: createHash("sha256").update(buf).digest("hex") };
}

/**
 * Strips JPEG APP1 (EXIF/XMP) and PNG textual/eXIf chunks. GAP: full re-encoding (e.g. with
 * sharp) is not done; metadata segments are removed byte-wise. PDFs are stored but never
 * rendered or parsed in the web process.
 */
export function stripImageMetadata(buf: Uint8Array, mime: string): Uint8Array {
  if (mime === "image/jpeg") {
    const out: number[] = [0xff, 0xd8];
    let i = 2;
    while (i + 4 <= buf.length && buf[i] === 0xff) {
      const marker = buf[i + 1]!;
      if (marker === 0xda) { for (let k = i; k < buf.length; k++) out.push(buf[k]!); return Uint8Array.from(out); }
      const len = (buf[i + 2]! << 8) | buf[i + 3]!;
      const isMeta = marker === 0xe1 || marker === 0xed || marker === 0xfe; // APP1 (EXIF/XMP), APP13 (IPTC), COM
      if (!isMeta) for (let k = i; k < i + 2 + len; k++) out.push(buf[k]!);
      i += 2 + len;
    }
    return buf;
  }
  if (mime === "image/png") {
    const out: number[] = Array.from(buf.slice(0, 8));
    let i = 8;
    while (i + 8 <= buf.length) {
      const len = (buf[i]! << 24 >>> 0) + (buf[i + 1]! << 16) + (buf[i + 2]! << 8) + buf[i + 3]!;
      const type = String.fromCharCode(buf[i + 4]!, buf[i + 5]!, buf[i + 6]!, buf[i + 7]!);
      const end = i + 12 + len;
      if (!["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(type)) for (let k = i; k < end && k < buf.length; k++) out.push(buf[k]!);
      i = end;
    }
    return Uint8Array.from(out);
  }
  return buf;
}

/** Private local storage. Files are never served directly; access goes through an authorized route. */
export class LocalPrivateStorage {
  constructor(private dir: string) {}
  async put(buf: Uint8Array, ext: string): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const key = `${randomUUID()}.${ext.replace(/[^a-z0-9]/g, "")}`;
    await writeFile(path.join(this.dir, key), buf, { mode: 0o600 });
    return key;
  }
  async get(key: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(key)) throw new Error("invalid storage key");
    return readFile(path.join(this.dir, key));
  }
}
