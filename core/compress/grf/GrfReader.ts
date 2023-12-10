import fs from 'fs';
import zlib from 'zlib';
import iconv from 'iconv-lite';
import { decryptFileContent } from './crypto/Core';
import {
  GRF_HEADER_MAGIC,
  GRF_HEADER_SIZE,
  GRF_TABLE_INFO2_SIZE,
} from './constants';

interface GrfContainer {
  header: GrfHeader;
  tableInfo: GrfTableInfo;
  entries: Map<string, GrfFileEntry>;
}

interface GrfHeader {
  key: Uint8Array; // 14 bytes
  fileTableOffset: number;
  seed: number;
  fileCount: number;
  versionMajor: number;
  versionMinor: number;
}

type GrfTableInfo = GrfTableInfo1 | GrfTableInfo2;

interface GrfTableInfo1 {
  tableSize: number;
}

interface GrfTableInfo2 {
  tableSizeCompressed: number;
  tableSize: number;
}

interface GrfFileEntry {
  relativePath: string;
  sizeCompressed: number;
  sizeCompressedAligned: number;
  size: number;
  entryType: number;
  offset: number;
  encryption: GrfFileEncryption;
}

enum GrfFileEncryption {
  Unencrypted,
  Encrypted, // No direct numeric value associated here
}

// The nom library's parsing functions will be handled later

export default class GrfArchive {
  private container: GrfContainer | undefined = undefined;
  private grfPath: string;
  private entries: Map<string, GrfFileEntry> = new Map();

  async open(grfPath: string): Promise<GrfContainer> {
    try {
      const fileBuffer: Buffer = fs.readFileSync(grfPath);
      this.grfPath = grfPath;
      const grfHeaderBuf: Buffer = fileBuffer.slice(0, GRF_HEADER_SIZE);
      const grfHeader = parseGrfHeader(grfHeaderBuf);
      switch (grfHeader.versionMajor) {
        case 2:
          const tableInfoStart = GRF_HEADER_SIZE + grfHeader.fileTableOffset;
          const tableInfoBuffer = fileBuffer.slice(
            tableInfoStart,
            tableInfoStart + GRF_TABLE_INFO2_SIZE
          );
          const grfTableInfo = parseGrfTableInfo200(tableInfoBuffer);
          const tableInfoEnd =
            tableInfoStart +
            GRF_TABLE_INFO2_SIZE +
            grfTableInfo.tableSizeCompressed;

          if (
            grfTableInfo.tableSizeCompressed === 0 ||
            grfTableInfo.tableSize === 0
          ) {
            const container: GrfContainer = {
              header: grfHeader,
              tableInfo: grfTableInfo,
              entries: new Map(), // Initialize an empty map for entries
            };
            this.container = container;
            return container;
          }

          const compressedTable = fileBuffer.slice(
            tableInfoStart + GRF_TABLE_INFO2_SIZE,
            tableInfoEnd
          );

          const decompressedTable = zlib.unzipSync(compressedTable);
          const entries = parseGrfFileEntries200(
            decompressedTable,
            grfHeader.fileCount
          );

          const container: GrfContainer = {
            header: grfHeader,
            tableInfo: grfTableInfo,
            entries: entries, // Ensure entries are parsed and stored appropriately
          };
          this.entries = entries;
          this.container = container;
          return container;

        default:
          throw new Error('Unsupported archive version');
      }
    } catch (error) {
      console.error('Error reading GRF file:', error);
      throw error;
    }
  }

  fileCount(): number {
    return this.container.header.fileCount;
  }

  versionMajor(): number {
    // Return the major version of the GRF file
    return this.container.header.versionMajor; // Placeholder
  }

  versionMinor(): number {
    // Return the minor version of the GRF file
    return this.container.header.versionMinor; // Placeholder
  }

  async getEntryRawData(filePath: string): Promise<Uint8Array> {
    const fileEntry = this.getFileEntry(filePath);
    if (!fileEntry) {
      throw new Error('Entry not found');
    }

    if (fileEntry.size === 0) {
      return new Uint8Array();
    }

    // Read the file content based on the entry information
    const fileBuffer: Buffer = fs.readFileSync(this.grfPath); // Assuming this.grfPath is the path to the GRF file
    const contentBuffer = fileBuffer.slice(
      fileEntry.offset,
      fileEntry.offset + fileEntry.sizeCompressedAligned
    );

    return new Uint8Array(contentBuffer);
  }

  async readFileContent(filePath: string): Promise<Uint8Array> {
    const fileEntry = this.entries.get(filePath);
    if (!fileEntry) {
      throw new Error('Entry not found');
    }
    if (fileEntry.size === 0) {
      return new Uint8Array();
    }

    const fileBuffer: Buffer = fs.readFileSync(this.grfPath);
    const contentStart = fileEntry.offset;
    const contentEnd = contentStart + fileEntry.sizeCompressedAligned;
    let content: Uint8Array | Buffer = fileBuffer.slice(
      contentStart,
      contentEnd
    );

    if (fileEntry.encryption === GrfFileEncryption.Encrypted) {
      content = decryptFileContent(content, fileEntry.encryption);
    }

    try {
      const decompressedContent = zlib.unzipSync(content);
      if (decompressedContent.length !== fileEntry.size) {
        throw new Error(
          'Decompressed content size does not match expected size'
        );
      }
      return new Uint8Array(decompressedContent);
    } catch (error) {
      throw new Error('Failed to decompress content');
    }
  }

  containsFile(filePath: string): boolean {
    return this.entries.has(filePath);
  }

  // Retrieves a specific file entry from the GRF archive
  getFileEntry(filePath: string): GrfFileEntry | undefined {
    return this.entries.get(filePath);
  }

  // Retrieves all file entries in the GRF archive
  getEntries(): IterableIterator<GrfFileEntry> {
    return this.entries.values();
  }
}

export function parseGrfHeader(buffer: Buffer): GrfHeader {
  // Check if the buffer starts with the GRF_HEADER_MAGIC
  if (
    buffer.slice(0, GRF_HEADER_MAGIC.length).toString('utf-8') !==
    GRF_HEADER_MAGIC
  ) {
    throw new Error('Invalid GRF header magic');
  }

  // Parse the header
  let offset = GRF_HEADER_MAGIC.length;
  const key = buffer.slice(offset, offset + 14);
  offset += 14;

  const fileTableOffset = buffer.readUInt32LE(offset);
  offset += 4;

  const seed = buffer.readInt32LE(offset);
  offset += 4;

  const vFilesCount = buffer.readInt32LE(offset);
  offset += 4;

  const version = buffer.readUInt32LE(offset);
  const versionMajor = (version >> 8) & 0xff;
  const versionMinor = version & 0xff;

  return {
    key,
    fileTableOffset,
    seed,
    fileCount: vFilesCount - seed - 7,
    versionMajor,
    versionMinor,
  };
}

function parseGrfTableInfo200(buffer: Buffer): GrfTableInfo2 {
  if (buffer.length < 8) {
    throw new Error('Buffer too short for GRF table info');
  }

  const tableSizeCompressed = buffer.readUInt32LE(0);
  const tableSize = buffer.readUInt32LE(4);

  return {
    tableSizeCompressed,
    tableSize,
  };
}

function parseGrfFileEntries200(
  buffer: Buffer,
  filesCount: number
): Map<string, GrfFileEntry> {
  let currentOffset = 0;
  const entries = new Map<string, GrfFileEntry>();

  for (let i = 0; i < filesCount; i++) {
    const [entry, nextOffset] = parseGrfFileEntry200(buffer, currentOffset);
    entries.set(entry.relativePath, entry);
    currentOffset = nextOffset;
  }

  return entries;
}

function parseGrfFileEntry200(
  buffer: Buffer,
  offset: number
): [GrfFileEntry | null, number] {
  try {
    // Check if the buffer has enough size for the smallest possible entry
    if (offset + 1 + 4 + 4 + 4 + 1 + 4 > buffer.length) {
      return [null, offset];
    }

    // Find the end of the null-terminated string
    let endOfString = offset;
    while (buffer[endOfString] !== 0x00 && endOfString < buffer.length) {
      endOfString++;
    }

    // Check if we found a null terminator
    if (buffer[endOfString] !== 0x00) {
      return [null, offset];
    }

    // Parse the string using Windows 1252 encoding
    const relativePath = iconv.decode(
      buffer.slice(offset, endOfString),
      'win1252'
    );

    offset = endOfString + 1; // Skip the null terminator

    // Parse the other fields
    const sizeCompressed = buffer.readUInt32LE(offset);
    offset += 4;

    const sizeCompressedAligned = buffer.readUInt32LE(offset);
    offset += 4;

    const size = buffer.readUInt32LE(offset);
    offset += 4;

    const entryType = buffer.readUInt8(offset);
    offset += 1;

    const fileOffset = buffer.readUInt32LE(offset) + GRF_HEADER_SIZE;
    offset += 4;

    // Create the GrfFileEntry object
    const entry: GrfFileEntry = {
      relativePath,
      sizeCompressed,
      sizeCompressedAligned,
      size,
      entryType,
      offset: fileOffset,
      encryption: GrfFileEncryption.Unencrypted,
    };

    return [entry, offset];
  } catch (error) {
    console.error('Error parsing GRF file entry:', error);
    return [null, offset];
  }
}
