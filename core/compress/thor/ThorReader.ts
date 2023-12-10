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
    const fileHandle = await fs.promises.open(thorArchivePath, 'r');
    const fileStats = await fileHandle.stat();
    const fileBuffer = Buffer.alloc(fileStats.size);
    await fileHandle.read(fileBuffer, 0, fileStats.size, 0);
    const thorPatch = await parseThorPatch(fileBuffer);
    return new ThorArchive(fileHandle, thorPatch);
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
    if (!fileEntry || fileEntry.sizeCompressed === 0) {
      return Buffer.alloc(0);
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
    const content = await this.getEntryRawData(filePath);
    return zlib.inflateSync(content);
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
    const integrityData = await this.readFileContent('data.integrity');
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

class ThorFileEntry {
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

  const useGrfMerging = view.getUint8(offset) === 1;
  offset += 1;

  const fileCount = view.getUint32(offset, true);
  offset += 4;

  const mode = view.getInt16(offset, true);
  offset += 2;

  const targetGrfNameSize = view.getUint8(offset);
  offset += 1;

  const targetGrfNameBytes = data.subarray(offset, offset + targetGrfNameSize);
  const targetGrfName = new TextDecoder().decode(targetGrfNameBytes);

  return {
    useGrfMerging,
    fileCount,
    mode: i16ToThorMode(mode),
    targetGrfName,
  };
}

function parseSingleFileTable(data: Uint8Array): SingleFileTableDesc | null {
  if (data.byteLength < 1) {
    return null; // Ensure there's at least 1 byte to consume
  }

  // Optionally consume the first byte, since it's not used in computation
  // const consumedByte = data.slice(0, 1);

  return { fileTableOffset: 0 };
}

function parseMultipleFilesTable(
  data: Uint8Array
): MultipleFilesTableDesc | null {
  if (data.byteLength < 8) return null;

  const view = new DataView(data.buffer);
  const fileTableCompressedSize = view.getInt32(0, true);
  const fileTableOffset = view.getInt32(4, true);

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

  const view = new DataView(data.buffer);
  let offset = 0;

  const sizeCompressed = view.getInt32(offset, true);
  offset += 4;

  const size = view.getInt32(offset, true);
  offset += 4;

  const relativePathSize = view.getUint8(offset);
  offset += 1;

  if (offset + relativePathSize > data.byteLength) return null;

  const relativePathBytes = new Uint8Array(
    data.buffer,
    offset,
    relativePathSize
  );
  const relativePath = stringFromWin1252(relativePathBytes);
  if (relativePath === null) return null;

  // Create and return an instance of ThorFileEntry
  return new ThorFileEntry(
    sizeCompressed,
    size,
    relativePath,
    false, // isRemoved
    0 // offset
  );
}

function isFileRemoved(flags: number): boolean {
  return (flags & 0b1) === 1;
}

function parseMultipleFilesEntry(data: Uint8Array): ThorFileEntry | null {
  if (data.byteLength < 1) return null;

  const view = new DataView(data.buffer);
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

  if (data.byteLength < offset + 8) return null;
  const fileOffset = view.getUint32(offset, true);
  offset += 4;

  const sizeCompressed = view.getInt32(offset, true);
  offset += 4;

  const size = view.getInt32(offset, true);
  offset += 4;

  // Create and return an instance of ThorFileEntry for existing files
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
    offset += 8 + entry.relativePath.length + 1;
  }

  return entries;
}

async function parseThorPatch(data: Uint8Array): Promise<ThorContainer> {
  const HEADER_EXTENDED_MAX_SIZE =
    HEADER_MAX_SIZE +
    MULTIPLE_FILES_TABLE_DESC_SIZE +
    SINGLE_FILE_ENTRY_MAX_SIZE;

  if (data.byteLength < HEADER_EXTENDED_MAX_SIZE) {
    throw new Error('Failed to parse THOR header: data too short');
  }

  const header = parseThorHeader(data);
  if (!header) {
    throw new Error('Failed to parse THOR header');
  }

  switch (header.mode) {
    case ThorMode.Invalid:
      throw new Error('Invalid THOR header mode');

    case ThorMode.SingleFile: {
      const table = parseSingleFileTable(data);
      const entry = parseSingleFileEntry(data.subarray(table.fileTableOffset));
      if (!entry) {
        throw new Error('Failed to parse THOR file entry');
      }
      entry.offset = data.byteLength; // Assuming the offset is the end of the data
      return new ThorContainer(
        header,
        table, // Correct
        new Map([[entry.relativePath, entry]])
      );
    }

    case ThorMode.MultipleFiles: {
      const table = parseMultipleFilesTable(data);
      const compressedTable = data.subarray(
        table.fileTableOffset,
        table.fileTableOffset + table.fileTableCompressedSize
      );
      const decompressedTable = zlibDecompress(Buffer.from(compressedTable)); // Implement zlibDecompress to decompress the data
      const entries = parseMultipleFilesEntries(decompressedTable);
      return new ThorContainer(header, table, entries);
    }
  }
}
