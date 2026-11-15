// Minimal ZIP reader (stored + deflate) built on DecompressionStream, so Google
// Takeout archives can be imported without any dependency.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function isZipBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function findEocd(view) {
  const max = Math.min(view.byteLength, 66000);
  for (let offset = view.byteLength - 22; offset >= view.byteLength - max; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIG) return offset;
  }
  return -1;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read a zip archive into a Map of entryName -> Uint8Array.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function readZip(buffer) {
  const arrayBuffer =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('This does not look like a zip file (no end-of-central-directory record).');

  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let i = 0; i < total; i++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIG) break;

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (localOffset + 30 <= view.byteLength && view.getUint32(localOffset, true) === LOCAL_SIG) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);

      if (!name.endsWith('/')) {
        if (method === 0) entries.set(name, data);
        else if (method === 8) {
          try {
            entries.set(name, await inflateRaw(data));
          } catch {
            /* skip unreadable entry */
          }
        }
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

export function entryText(entries, name) {
  const bytes = entries.get(name);
  return bytes ? new TextDecoder().decode(bytes) : '';
}
