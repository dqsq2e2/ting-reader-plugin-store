// Ting Reader plugin SDK 2.0.0. Package this file with each JS extension.
// Host identity and resource grants are bound by the runtime, never by JSON.
export const SDK_VERSION = "2.0.1";
export const MAX_CHUNK_BYTES = 256 * 1024;

export async function host(method, input = {}) {
  if (typeof method !== "string" || !method || !input || typeof input !== "object") {
    throw new TypeError("Invalid Host operation");
  }
  return Ting.host.invoke(method, input);
}

export const resources = Object.freeze({
  stat: (resource) => Ting.resources.invoke("stat", { resource }),
  readAt: async (resource, offset, max_bytes = MAX_CHUNK_BYTES) => {
    if (!Number.isSafeInteger(offset) || offset < 0 ||
        !Number.isSafeInteger(max_bytes) || max_bytes <= 0 || max_bytes > MAX_CHUNK_BYTES) {
      throw new RangeError("Invalid resource read range");
    }
    const read = await Ting.resources.invoke("read_at", { resource, offset, max_bytes });
    try {
      const bytes = Ting.resources.chunkCopy(read.chunk);
      if (bytes.length !== read.bytes) throw new Error("Invalid Host chunk length");
      return { bytes, eof: read.eof };
    } finally {
      await Ting.resources.invoke("release_chunk", { chunk: read.chunk });
    }
  },
  writeAt: (resource, offset, bytes) => {
    if (!Number.isSafeInteger(offset) || offset < 0 ||
        !(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_CHUNK_BYTES) {
      throw new RangeError("Invalid resource write range");
    }
    return Ting.resources.writeAt(resource, offset, bytes);
  },
  createOutput: (mime_type = null) => Ting.resources.invoke("create_output", { mime_type }),
  finish: (resource) => Ting.resources.invoke("finish", { resource }),
  close: (resource) => Ting.resources.invoke("close", { resource }),
  createSession: () => Ting.resources.invoke("create_session", {}),
  closeSession: (session_id) => Ting.resources.invoke("close_session", { session_id }),
});

export async function readResource(resource, length, max_bytes = 20 * 1024 * 1024) {
  if (!Number.isSafeInteger(length) || length < 0 || length > max_bytes) {
    throw new RangeError("Resource length exceeds limit");
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  try {
    while (offset < length) {
      const read = await resources.readAt(resource, offset, Math.min(length - offset, MAX_CHUNK_BYTES));
      if (!read.bytes.length || read.bytes.length > length - offset) {
        throw new Error("Resource ended before declared length");
      }
      bytes.set(read.bytes, offset);
      offset += read.bytes.length;
      if (read.eof && offset < length) throw new Error("Resource truncated");
    }
    return bytes;
  } finally {
    await resources.close(resource);
  }
}

export function encodeBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected binary bytes");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const parts = [];
  let group = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    group.push(alphabet[(n >>> 18) & 63], alphabet[(n >>> 12) & 63],
      i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=",
      i + 2 < bytes.length ? alphabet[n & 63] : "=");
    if (group.length >= 16384) { parts.push(group.join("")); group = []; }
  }
  if (group.length) parts.push(group.join(""));
  return parts.join("");
}

export function decodeBase64(text, max_bytes = 20 * 1024 * 1024) {
  if (typeof text !== "string" || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
    throw new TypeError("Invalid base64 asset");
  }
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const length = (text.length / 4) * 3 - padding;
  if (length > max_bytes) throw new RangeError("Asset byte limit exceeded");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = alphabet.indexOf(text[i]);
    const b = alphabet.indexOf(text[i + 1]);
    const c = text[i + 2] === "=" ? 0 : alphabet.indexOf(text[i + 2]);
    const d = text[i + 3] === "=" ? 0 : alphabet.indexOf(text[i + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0 ||
        (text[i + 2] === "=" && text[i + 3] !== "=")) {
      throw new TypeError("Invalid base64 asset");
    }
    const number = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < length) bytes[offset++] = (number >>> 16) & 255;
    if (offset < length) bytes[offset++] = (number >>> 8) & 255;
    if (offset < length) bytes[offset++] = number & 255;
  }
  return bytes;
}

export async function createOutputFromBytes(bytes, mime_type) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected binary bytes");
  const { resource } = await resources.createOutput(mime_type);
  try {
    for (let offset = 0; offset < bytes.length;) {
      const count = resources.writeAt(
        resource, offset, bytes.subarray(offset, offset + MAX_CHUNK_BYTES));
      if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) {
        throw new Error("Host output write failed");
      }
      offset += count;
    }
    await resources.finish(resource);
    return resource;
  } catch (error) {
    await resources.close(resource);
    throw error;
  }
}

// Scraper parsers may have site-specific keys, but only this published DTO
// crosses the plugin boundary. Every nullable field is present explicitly.
export function publishSearch(parsed, request) {
  if (!parsed || !Array.isArray(parsed.items) ||
      !Number.isInteger(request?.page) || request.page < 1 ||
      !Number.isInteger(request?.page_size) || request.page_size < 1 || request.page_size > 100) {
    throw new TypeError("Invalid metadata search page");
  }
  const nullable = [
    "id", "source_url", "author", "narrator", "cover_url", "intro",
    "subtitle", "publisher", "language", "genre", "published_year",
    "published_date", "isbn", "asin", "explicit", "abridged", "duration",
    "score", "chapter_title_template",
  ];
  const items = parsed.items.slice(0, request.page_size).map((source) => {
    if (!source || typeof source.title !== "string" || !source.title.trim()) {
      throw new TypeError("Search result requires a title");
    }
    const item = { title: source.title.trim() };
    for (const field of nullable) {
      item[field] = source[field] ?? null;
    }
    for (const field of ["id", "source_url", "author", "narrator", "cover_url",
      "intro", "subtitle", "publisher", "language", "genre", "published_date",
      "isbn", "asin", "chapter_title_template"]) {
      if (typeof item[field] === "string") item[field] = item[field].trim() || null;
    }
    item.tags = Array.isArray(source.tags) ? [...new Set(source.tags
      .filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))] : [];
    item.chapter_titles = Array.isArray(source.chapter_titles) ? source.chapter_titles : [];
    return item;
  });
  return {
    items,
    page: request.page,
    page_size: request.page_size,
    total: Number.isSafeInteger(parsed.total) && parsed.total >= 0 ? parsed.total : null,
    has_more: parsed.has_more === true || parsed.has_more === false
      ? parsed.has_more : null,
  };
}

export function success(data) { return { ok: true, data }; }
export function failure(code, message, context) {
  return { ok: false, error: {
    code, message, details: null, retryable: false,
    plugin_id: context.plugin_id, capability_id: context.capability_id,
    operation: context.operation, request_id: context.request_id,
  } };
}
