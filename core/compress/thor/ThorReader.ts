import fs from 'fs';
import zlib from 'zlib';
import iconv from 'iconv-lite';
import * as crypto from 'crypto';

import {
  HEADER_MAX_SIZE,
  INTEGRITY_FILE_NAME,
  MULTIPLE_FILES_TABLE_DESC_SIZE,
  SINGLE_FILE_ENTRY_MAX_SIZE,
  THOR_HEADER_MAGIC,
} from './constant';

import { inflateSync } from 'zlib';

function zlibDecompress(data: Buffer): Buffer {
  return inflateSync(data);
}

export class ThorPatchInfo {
  index: number;
  fileName: string;

  constructor(index: number, fileName: string) {
    this.index = index;
    this.fileName = fileName;
  }

  static fromString(line: string): ThorPatchInfo | null {
    const words = line.trim().split(/\s+/);
    if (words.length < 2) return null;

    const index = parseInt(words[0]);
    if (isNaN(index)) return null;

    return new ThorPatchInfo(index, words[1]);
  }
}

export class ThorArchive {
  private obj: fs.promises.FileHandle;
  private container: ThorContainer; // Define ThorContainer according to your needs

  constructor(fileHandle: fs.promises.FileHandle, container: ThorContainer) {
    this.obj = fileHandle;
    this.container = container;
  }

  static async open(thorArchivePath: string): Promise<ThorArchive> {
    try {
      const fileHandle = await fs.promises.open(thorArchivePath, 'r');
      const fileStats = await fileHandle.stat();
      const fileBuffer = Buffer.alloc(fileStats.size);
      await fileHandle.read(fileBuffer, 0, fileStats.size, 0);
      const thorPatch = await parseThorPatch(fileBuffer);
      return new ThorArchive(fileHandle, thorPatch);
    } catch (error) {
      console.error('Error when opening thor :', error);
    }
  }

  static async new(filePath: string): Promise<ThorArchive> {
    const fileHandle = await fs.promises.open(filePath, 'r');
    const fileStats = await fileHandle.stat();
    const fileBuffer = Buffer.alloc(fileStats.size);
    await fileHandle.read(fileBuffer, 0, fileStats.size, 0);

    const thorPatch = await parseThorPatch(fileBuffer);
    return new ThorArchive(fileHandle, thorPatch);
  }

  useGrfMerging(): boolean {
    return this.container.header.useGrfMerging;
  }

  fileCount(): number {
    return this.container.entries.size;
  }

  targetGrfName(): string {
    return this.container.header.targetGrfName;
  }

  async getEntryRawData(filePath: string): Promise<Buffer> {
    const fileEntry = this.container.entries.get(filePath);
    if (!fileEntry) {
      console.error(`File entry not found for path: ${filePath}`);
      throw new Error(`File entry not found for path: ${filePath}`);
    }

    if (fileEntry.sizeCompressed <= 0) {
      console.error(
        `Invalid sizeCompressed for file: ${filePath}, sizeCompressed: ${fileEntry.sizeCompressed}`
      );
      return Buffer.alloc(0); // or handle this scenario as needed
    }

    // Read the data from the file at the specific offset
    const buffer = Buffer.alloc(fileEntry.sizeCompressed);
    await this.obj.read({
      buffer: buffer,
      offset: 0,
      length: fileEntry.sizeCompressed,
      position: fileEntry.offset,
    });

    return buffer;
  }

  async readFileContent(filePath: string): Promise<Buffer> {
    try {
      const fileEntry = this.getFileEntry(filePath);
      if (!fileEntry) {
        throw new Error('Entry not found');
      }

      if (fileEntry.sizeCompressed === 0) {
        return Buffer.alloc(0);
      }

      const buffer = Buffer.alloc(fileEntry.sizeCompressed);
      await this.obj.read({
        buffer: buffer,
        offset: 0,
        length: fileEntry.sizeCompressed,
        position: fileEntry.offset,
      });

      // Decompress the content
      const decompressedContent = zlib.inflateSync(buffer);

      if (decompressedContent.length !== fileEntry.size) {
        throw new Error('Decompressed content is not as expected');
      }

      return decompressedContent;
    } catch (error) {
      console.error('Error reading file content:', error);
      throw error;
    }
  }

  async extractFile(filePath: string, destinationPath: string): Promise<void> {
    const content = await this.readFileContent(filePath);
    await fs.promises.writeFile(destinationPath, content);
  }

  getFileEntry(filePath: string): ThorFileEntry | undefined {
    return this.container.entries.get(filePath);
  }

  getEntries(): Iterable<ThorFileEntry> {
    return this.container.entries.values();
  }

  async isValid(): Promise<boolean> {
    const integrityData = await this.readFileContent(INTEGRITY_FILE_NAME);
    const integrityDataStr = iconv.decode(integrityData, 'win1252');
    const integrityInfo = parseDataIntegrityInfo(integrityDataStr);

    for (const [filePath, hash] of integrityInfo) {
      const fileContent = await this.readFileContent(filePath);
      const computedHash = crypto
        .createHash('crc32')
        .update(fileContent)
        .digest('hex');

      if (computedHash !== hash.toString(16)) {
        return false;
      }
    }

    return true;
  }
}

enum ThorMode {
  SingleFile = 33,
  MultipleFiles = 48,
  Invalid,
}

interface ThorHeader {
  useGrfMerging: boolean;
  fileCount: number;
  mode: ThorMode;
  targetGrfName: string;
  offset: number;
}

interface SingleFileTableDesc {
  fileTableOffset: number;
}

interface MultipleFilesTableDesc {
  fileTableCompressedSize: number;
  fileTableOffset: number;
}

// ThorTable can be represented as a TypeScript type with union types
type ThorTable = SingleFileTableDesc | MultipleFilesTableDesc;

export class ThorFileEntry {
  sizeCompressed: number;
  size: number;
  relativePath: string;
  isRemoved: boolean;
  offset: number;

  constructor(
    sizeCompressed: number,
    size: number,
    relativePath: string,
    isRemoved: boolean,
    offset: number
  ) {
    this.sizeCompressed = sizeCompressed;
    this.size = size;
    this.relativePath = relativePath;
    this.isRemoved = isRemoved;
    this.offset = offset;
  }

  isInternal(): boolean {
    return this.relativePath === INTEGRITY_FILE_NAME; // Define INTEGRITY_FILE_NAME constant
  }
}

class ThorContainer {
  header: ThorHeader;
  table: ThorTable;
  entries: Map<string, ThorFileEntry>;

  constructor(
    header: ThorHeader,
    table: ThorTable,
    entries: Map<string, ThorFileEntry>
  ) {
    this.header = header;
    this.table = table;
    this.entries = entries;
  }
}

// Helper Functions
function i16ToThorMode(i: number): ThorMode {
  switch (i) {
    case 33:
      return ThorMode.SingleFile;
    case 48:
      return ThorMode.MultipleFiles;
    default:
      return ThorMode.Invalid;
  }
}

export function parseDataIntegrityInfo(data: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = data.split('\n');

  for (const line of lines) {
    const parts = line.trim().split('=');
    if (parts.length !== 2) continue;

    const fileName = parts[0].trim();
    const hash = parseInt(parts[1].trim(), 16);

    if (!isNaN(hash)) {
      map.set(fileName, hash);
    }
  }

  return map;
}

function parseThorHeader(data: Uint8Array): ThorHeader | null {
  const magicLength = THOR_HEADER_MAGIC.length;
  if (data.length < magicLength) return null;

  const magic = data.slice(0, magicLength);
  if (!arraysEqual(magic, THOR_HEADER_MAGIC)) return null;

  const view = new DataView(data.buffer);
  let offset = magicLength;

  const useGrfMerging = view.getUint8(offset);
  offset += 1; // Increment for useGrfMerging

  const fileCount = view.getUint32(offset, true);
  offset += 4; // Increment for fileCount

  const mode = view.getInt16(offset, true);
  offset += 2; // Increment for mode

  const targetGrfNameSize = view.getUint8(offset);
  offset += 1; // Increment for targetGrfNameSize byte

  // If targetGrfNameSize is 0, we need to add one more to the offset for the length byte
  if (targetGrfNameSize === 0) {
    offset += 1;
  } else {
    offset += targetGrfNameSize; // Move past the targetGrfName
  }

  return {
    useGrfMerging: useGrfMerging === 1,
    fileCount,
    mode: i16ToThorMode(mode),
    targetGrfName:
      targetGrfNameSize > 0
        ? new TextDecoder().decode(
            data.slice(offset - targetGrfNameSize, offset)
          )
        : '',
    offset: offset,
  };
}

function parseSingleFileTable(data: Uint8Array): SingleFileTableDesc | null {
  if (data.byteLength < 1) {
    return null; // Ensure there's at least 1 byte to consume
  }
  return { fileTableOffset: 0 };
}

function parseMultipleFilesTable(
  buffer: Buffer
): MultipleFilesTableDesc | null {
  if (buffer.byteLength < 8) {
    // Ensure buffer has at least 8 bytes (4 bytes for size and 4 bytes for offset)
    return null;
  }

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  // Read the file table compressed size and offset as 32-bit integers (little-endian)
  const fileTableCompressedSize = view.getInt32(0, true);
  const fileTableOffset = view.getInt32(4, true);

  for (let i = 0; i < 300; i++) {
    const view = new DataView(buffer.buffer, i);

    // Read the file table compressed size and offset as 32-bit integers (little-endian)
    const fileTableCompressedSizeC = view.getInt32(0, true);
    const fileTableOffsetC = view.getInt32(4, true);
    console.log('Compressed Size', i, ':', fileTableCompressedSizeC);
    console.log('Offset', i, ':', fileTableOffsetC);
  }

  console.log(fileTableOffset);

  return {
    fileTableCompressedSize,
    fileTableOffset,
  };
}

// Utility function to check if two typed arrays are equal
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function stringFromWin1252(v: Uint8Array): string | null {
  try {
    const decoder = new TextDecoder('windows-1252');
    return decoder.decode(v);
  } catch (error) {
    console.error('Error decoding string:', error);
    return null;
  }
}

function parseSingleFileEntry(data: Uint8Array): ThorFileEntry | null {
  if (data.byteLength < 9) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const sizeCompressed = view.getInt32(offset, true); // Read as signed 32-bit int, little-endian
  offset += 4;

  const size = view.getInt32(offset, true); // Read as signed 32-bit int, little-endian
  offset += 4;

  const relativePathSize = view.getUint8(offset); // Read as unsigned 8-bit int
  offset += 1;

  if (offset + relativePathSize > data.byteLength) return null;

  const relativePathBytes = new Uint8Array(
    data.buffer,
    data.byteOffset + offset,
    relativePathSize
  );
  const relativePath = stringFromWin1252(relativePathBytes); // Ensure correct Windows-1252 decoding

  if (relativePath === null) return null;

  // No update to offset since it's managed outside this function, similar to Rust implementation
  return new ThorFileEntry(sizeCompressed, size, relativePath, false, offset);
}

function isFileRemoved(flags: number): boolean {
  return (flags & 0b1) === 1;
}

function parseMultipleFilesEntry(data: Uint8Array): ThorFileEntry | null {
  if (data.byteLength < 1) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const relativePathSize = view.getUint8(offset);
  offset += 1;

  if (offset + relativePathSize > data.byteLength) return null;

  const relativePathBytes = new Uint8Array(
    data.buffer,
    offset,
    relativePathSize
  );

  const relativePath = stringFromWin1252(relativePathBytes);
  console.log(relativePath);
  if (relativePath === null) return null;
  offset += relativePathSize;

  if (data.byteLength < offset + 1) return null;
  const flags = view.getUint8(offset);
  offset += 1;

  if (isFileRemoved(flags)) {
    // Create and return an instance of ThorFileEntry for removed files
    return new ThorFileEntry(
      0, // sizeCompressed
      0, // size
      relativePath,
      true, // isRemoved
      0 // offset
    );
  }

  // For existing files, read offset, sizeCompressed, and size
  if (data.byteLength < offset + 12) return null; // Ensure there's enough data for the remaining fields
  const fileOffset = view.getUint32(offset, true);
  offset += 4;

  const sizeCompressed = view.getInt32(offset, true);
  offset += 4;

  const size = view.getInt32(offset, true);
  offset += 4;

  console.log(offset);

  return new ThorFileEntry(
    sizeCompressed,
    size,
    relativePath,
    false, // isRemoved
    fileOffset
  );
}

function parseMultipleFilesEntries(
  data: Uint8Array
): Map<string, ThorFileEntry> {
  const entries = new Map<string, ThorFileEntry>();
  let offset = 0;
  while (offset < data.byteLength) {
    const entry = parseMultipleFilesEntry(data.subarray(offset));
    if (entry === null) break;
    entries.set(entry.relativePath, entry);

    console.log(offset);

    offset += entry.offset + entry.sizeCompressed;
  }

  return entries;
}

async function parseThorPatch(data: Uint8Array): Promise<ThorContainer> {
  try {
    const HEADER_EXTENDED_MAX_SIZE =
      HEADER_MAX_SIZE +
      MULTIPLE_FILES_TABLE_DESC_SIZE +
      SINGLE_FILE_ENTRY_MAX_SIZE;

    const headerData = data.slice(0, HEADER_EXTENDED_MAX_SIZE);

    const header = parseThorHeader(headerData);
    const headerSize = calculateHeaderSize(Buffer.from(headerData));
    header.offset =
      header.mode === 48
        ? header.targetGrfName === ''
          ? headerSize - 1
          : headerSize
        : headerSize;
    console.log(headerSize);
    if (!header) {
      throw new Error('Failed to parse THOR header');
    }
    const slicedData = data.slice(header.offset);
    console.log(HEADER_MAX_SIZE);
    console.log(header);

    switch (header.mode) {
      case ThorMode.Invalid:
        throw new Error('Invalid THOR header mode');

      case ThorMode.SingleFile: {
        const table = parseSingleFileTable(slicedData);
        console.log('Table:', table);
        const entry = parseSingleFileEntry(
          slicedData.subarray(table.fileTableOffset)
        );

        if (!entry) {
          throw new Error('Failed to parse THOR file entry');
        }
        entry.offset = header.mode + entry.offset; // Assuming the offset is the end of the data
        return new ThorContainer(
          header,
          table, // Correct
          new Map([[entry.relativePath, entry]])
        );
      }

      case ThorMode.MultipleFiles: {
        const table = parseMultipleFilesTable(Buffer.from(slicedData));
        console.log(table);

        if (data.byteLength < headerSize) {
          return new ThorContainer(
            header,
            table,
            new Map([['', new ThorFileEntry(0, 0, '', false, 0)]])
          );
        }

        const compressedTablePosition = table.fileTableOffset - header.offset;
        console.log(table.fileTableOffset);
        header;
        console.log(compressedTablePosition);
        const compressedTable = slicedData.subarray(compressedTablePosition);
        console.log(compressedTable.length);
        console.log(data.length);
        console.log(data.length - header.offset);
        console.log(table.fileTableOffset);
        console.log(compressedTable);
        console.log(compressedTable.length);
        const decompressedTable = zlibDecompress(Buffer.from(compressedTable));
        console.log('reach');
        const entries = parseMultipleFilesEntries(decompressedTable);
        return new ThorContainer(header, table, entries);
      }
    }
  } catch (error) {
    console.error('Error when parse thor patch :', error);
  }
}

function calculateHeaderSize(data: Uint8Array): number {
  const magicLength = THOR_HEADER_MAGIC.length;
  let totalHeaderSize = magicLength; // Start with the magic length

  // Fixed-size fields
  totalHeaderSize += 1; // 1 byte for useGrfMerging
  totalHeaderSize += 4; // 4 bytes for fileCount (getUint32)
  totalHeaderSize += 2; // 2 bytes for mode (getInt16)
  totalHeaderSize += 1; // 1 byte for targetGrfNameSize

  // Variable-length field: targetGrfName
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const targetGrfNameSize = view.getUint8(magicLength + 7); // 7 = 1 + 4 + 2 (bytes for useGrfMerging, fileCount, mode)

  totalHeaderSize += targetGrfNameSize === 0 ? 1 : targetGrfNameSize;

  return totalHeaderSize;
}
