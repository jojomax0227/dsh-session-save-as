/**
 * Minimal ZIP writer for OOXML packages.
 *
 * A `.docx` file is a ZIP archive of XML parts. This writer supports exactly
 * what Word needs (store or DEFLATE entries, UTF-8 names) without pulling in a
 * runtime dependency, so the plugin keeps working when it is installed as a
 * plain directory inside a profile.
 */
import { deflateRawSync } from 'node:zlib'

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const UTF8_FLAG = 0x0800
const METHOD_STORE = 0
const METHOD_DEFLATE = 8
const VERSION = 20

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value
  }
  return table
})()

/**
 * Compute the ZIP CRC-32 of one buffer.
 * @param {Uint8Array} bytes - entry content.
 * @returns {number} unsigned CRC-32.
 */
function crc32(bytes) {
  let crc = -1
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

/**
 * Encode one instant as a DOS date and time pair.
 * @param {Date} date - entry timestamp.
 * @returns {{ time: number, date: number }} packed DOS fields.
 */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/**
 * Write one entry header.
 * @param {number} signature - local or central signature.
 * @param {Buffer} name - UTF-8 entry name.
 * @param {number} crc - CRC-32 of the uncompressed content.
 * @param {number} compressedSize - stored payload size.
 * @param {number} size - uncompressed size.
 * @param {number} method - 0 or 8.
 * @param {{ time: number, date: number }} stamp - DOS timestamp.
 * @param {number} offset - local header offset; ignored for local headers.
 * @returns {Buffer} header bytes.
 */
function header(signature, name, crc, compressedSize, size, method, stamp, offset) {
  const local = signature === LOCAL_HEADER_SIGNATURE
  const buffer = Buffer.alloc(local ? 30 : 46)
  buffer.writeUInt32LE(signature, 0)
  if (local) {
    buffer.writeUInt16LE(VERSION, 4)
    buffer.writeUInt16LE(UTF8_FLAG, 6)
    buffer.writeUInt16LE(method, 8)
    buffer.writeUInt16LE(stamp.time, 10)
    buffer.writeUInt16LE(stamp.date, 12)
    buffer.writeUInt32LE(crc >>> 0, 14)
    buffer.writeUInt32LE(compressedSize, 18)
    buffer.writeUInt32LE(size, 22)
    buffer.writeUInt16LE(name.length, 26)
    buffer.writeUInt16LE(0, 28)
    return Buffer.concat([buffer, name])
  }
  buffer.writeUInt16LE(VERSION, 4)
  buffer.writeUInt16LE(VERSION, 6)
  buffer.writeUInt16LE(UTF8_FLAG, 8)
  buffer.writeUInt16LE(method, 10)
  buffer.writeUInt16LE(stamp.time, 12)
  buffer.writeUInt16LE(stamp.date, 14)
  buffer.writeUInt32LE(crc >>> 0, 16)
  buffer.writeUInt32LE(compressedSize, 20)
  buffer.writeUInt32LE(size, 24)
  buffer.writeUInt16LE(name.length, 28)
  buffer.writeUInt16LE(0, 30)
  buffer.writeUInt16LE(0, 32)
  buffer.writeUInt16LE(0, 34)
  buffer.writeUInt16LE(0, 36)
  buffer.writeUInt32LE(0, 38)
  buffer.writeUInt32LE(offset, 42)
  return Buffer.concat([buffer, name])
}

/**
 * Pack files into a deflated ZIP archive.
 * @param {ReadonlyArray<{ name: string, data: string | Uint8Array }>} files - archive entries in order.
 * @param {Date} [date] - entry timestamp; defaults to now.
 * @returns {Buffer} the archive bytes.
 */
export function zip(files, date = new Date()) {
  const stamp = dosDateTime(date)
  const chunks = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = typeof file.data === 'string' ? Buffer.from(file.data, 'utf8') : Buffer.from(file.data)
    const crc = crc32(raw)
    const deflated = raw.length > 0 ? deflateRawSync(raw, { level: 6 }) : raw
    const method = deflated.length < raw.length ? METHOD_DEFLATE : METHOD_STORE
    const payload = method === METHOD_DEFLATE ? deflated : raw
    const local = header(LOCAL_HEADER_SIGNATURE, name, crc, payload.length, raw.length, method, stamp, 0)
    chunks.push(local, payload)
    central.push(header(CENTRAL_HEADER_SIGNATURE, name, crc, payload.length, raw.length, method, stamp, offset))
    offset += local.length + payload.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, directory, end])
}
