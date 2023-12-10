import fs, { createWriteStream } from 'fs';
import zlib, { deflateSync } from 'zlib';
import GrfArchive from './GrfReader';
import { AvailableChunkList } from './DynAlloc';
import { GRF_FIXED_KEY, GRF_HEADER_MAGIC, GRF_HEADER_SIZE } from './constants';
import { ThorArchive } from '../thor/ThorReader';

interface GenericFileEntry {
  offset: number;
  size: number;
  sizeCompressed: number;
}

export class GrfArchiveBuilder {
  private obj: fs.WriteStream; // Assuming we use a file stream
  private startOffset: number;
  private finished: boolean;
  private versionMajor: number;
  private versionMinor: number;
  private entries: Map<string, GenericFileEntry>;
  private chunks: AvailableChunkList;
  private filePath: string;

  constructor(
    filePath: string,
    versionMajor: number,
    versionMinor: number,
    fileStream?: fs.WriteStream,
    entries?: Map<string, GenericFileEntry>,
    chunks?: AvailableChunkList
  ) {
    this.filePath = filePath;
    this.obj =
      fileStream !== undefined
        ? fileStream
        : fs.createWriteStream(filePath, { flags: 'r+' }); // Open file for reading and writing
    this.startOffset = 0; // Initialize as per your logic
    this.finished = false;
    this.versionMajor = versionMajor;
    this.versionMinor = versionMinor;
    this.entries =
      entries !== undefined ? entries : new Map<string, GenericFileEntry>();
    this.chunks = chunks !== undefined ? chunks : new AvailableChunkList(); // Initialize this as per your needs
  }

  // Static async method to create a new GrfArchiveBuilder instance
  static async create(
    filePath: string,
    versionMajor: number,
    versionMinor: number
  ): Promise<GrfArchiveBuilder> {
    const builder = new GrfArchiveBuilder(filePath, versionMajor, versionMinor);

    // Initialize file with GRF header placeholder
    const fileHandle = await fs.promises.open(filePath, 'w');
    await fileHandle.write(Buffer.alloc(GRF_HEADER_SIZE));
    await fileHandle.close();

    return builder;
  }

  async importRawEntryFromGrf(
    archive: GrfArchive,
    relativePath: string
  ): Promise<void> {
    const entry = archive.getFileEntry(relativePath);
    if (!entry) {
      throw new Error('Entry not found'); // Replace with proper error handling
    }

    const content = await archive.getEntryRawData(relativePath);
    let offset: number;
    if (this.entries.has(relativePath)) {
      const grfEntry = this.entries.get(relativePath);
      // Reallocate the chunk in your chunks structure
      offset = await this.chunks.reallocChunk(
        grfEntry.offset,
        grfEntry.sizeCompressed,
        content.length
      );
    } else {
      // Allocate a new chunk in your chunks structure
      offset = await this.chunks.allocChunk(content.length);
    }

    // Write content to the file at the specific offset
    const fileHandle = await fs.promises.open(this.filePath, 'r+');
    await fileHandle.write(
      content,
      0,
      content.length,
      this.startOffset + offset
    );
    await fileHandle.close();

    // Update entries map
    this.entries.set(relativePath, {
      offset: offset,
      size: entry.size,
      sizeCompressed: entry.sizeCompressedAligned,
    });
  }

  async importRawEntryFromThor(
    thorArchive: ThorArchive, // Make sure ThorArchive is defined or imported
    relativePath: string
  ): Promise<void> {
    const entry = thorArchive.getFileEntry(relativePath);
    if (!entry) {
      throw new Error('Entry not found');
    }

    const content = await thorArchive.getEntryRawData(relativePath);
    let offset: number;

    if (this.entries.has(relativePath)) {
      const grfEntry = this.entries.get(relativePath);
      offset = await this.chunks.reallocChunk(
        grfEntry.offset,
        grfEntry.sizeCompressed,
        content.length
      );
    } else {
      offset = await this.chunks.allocChunk(content.length);
    }

    const fileHandle = await fs.promises.open(this.filePath, 'r+');
    await fileHandle.write(
      content,
      0,
      content.length,
      this.startOffset + offset
    );
    await fileHandle.close();

    this.entries.set(relativePath, {
      offset: offset,
      size: entry.size,
      sizeCompressed: entry.sizeCompressed,
    });
  }

  async addFile(relativePath: string, data: Buffer): Promise<void> {
    // Compress the data
    const compressedData = zlib.deflateSync(data);

    // Determine the offset where the file will be written
    let offset: number;
    if (this.entries.has(relativePath)) {
      const grfEntry = this.entries.get(relativePath);
      offset = await this.chunks.reallocChunk(
        grfEntry.offset,
        grfEntry.sizeCompressed,
        compressedData.length
      );
    } else {
      offset = await this.chunks.allocChunk(compressedData.length);
    }

    // Write the compressed data to the file
    const fileHandle = await fs.promises.open(this.filePath, 'r+');
    await fileHandle.write(
      compressedData,
      0,
      compressedData.length,
      this.startOffset + offset
    );
    await fileHandle.close();

    // Update the entries map
    this.entries.set(relativePath, {
      offset: offset,
      size: data.length,
      sizeCompressed: compressedData.length,
    });
  }

  async removeFile(relativePath: string): Promise<boolean> {
    if (this.entries.has(relativePath)) {
      const entry = this.entries.get(relativePath);

      // Free the chunk associated with this file
      await this.chunks.freeChunk(entry.offset, entry.sizeCompressed);

      // Remove the entry from the map
      this.entries.delete(relativePath);

      return true;
    } else {
      return false;
    }
  }

  async finish(): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;

    const vFileCount = this.entries.size + 7;
    let fileTableOffset: number;

    switch (this.versionMajor) {
      case 2:
        fileTableOffset = await this.writeGrfTable200();
        break;
      case 1:
        throw new Error('Version 1.x GRF format not implemented');
      default:
        throw new Error('Unsupported GRF file format version');
    }

    // Update the header
    const fileHandle = await fs.promises.open(this.obj.path, 'r+');
    await writeGrfHeader(
      (this.versionMajor << 8) | this.versionMinor,
      fileTableOffset - GRF_HEADER_SIZE,
      vFileCount,
      fileHandle
    );
    await fileHandle.close();
  }

  private async writeGrfTable200(): Promise<number> {
    let tableBuffer = Buffer.alloc(0);

    // Generate table and write files' content
    for (const [relativePath, entry] of this.entries) {
      const grfFileEntry = {
        sizeCompressed: entry.sizeCompressed,
        sizeCompressedAligned: entry.sizeCompressed,
        size: entry.size,
        entryType: 1,
        offset: entry.offset - GRF_HEADER_SIZE,
      };

      // Serialize as win1252 C string
      const pathBuffer = Buffer.from(relativePath + '\0', 'binary');
      tableBuffer = Buffer.concat([tableBuffer, pathBuffer]);

      // Serialize GRF file entry (you may need a custom function to correctly serialize this)
      const entryBuffer = Buffer.from([
        ...toBytesLE(grfFileEntry.sizeCompressed),
        ...toBytesLE(grfFileEntry.sizeCompressedAligned),
        ...toBytesLE(grfFileEntry.size),
        grfFileEntry.entryType,
        ...toBytesLE(grfFileEntry.offset),
      ]);
      tableBuffer = Buffer.concat([tableBuffer, entryBuffer]);
    }

    // Compress the table
    const compressedTable = deflateSync(tableBuffer);
    const compressedTableSize = compressedTable.length;

    // Allocate chunk and write the compressed table to the file
    const tableOffset = await this.chunks.allocChunk(compressedTableSize + 8); // 8 bytes for the size fields
    const fileHandle = await fs.promises.open(this.obj.path, 'r+');

    // Write table's size (compressed and uncompressed)
    const tableSizeBuffer = Buffer.from([
      ...toBytesLE(compressedTableSize),
      ...toBytesLE(tableBuffer.length),
    ]);
    await fileHandle.write(
      tableSizeBuffer,
      0,
      tableSizeBuffer.length,
      this.startOffset + tableOffset
    );

    // Write table's content
    await fileHandle.write(
      compressedTable,
      0,
      compressedTableSize,
      this.startOffset + tableOffset + 8
    );
    await fileHandle.close();

    return tableOffset;
  }

  static async open(filePath: string): Promise<GrfArchiveBuilder> {
    const grfArchive = await new GrfArchive();
    grfArchive.open(filePath);
    const ch = new AvailableChunkList();
    const chunks = ch.listAvailableChunks(grfArchive);
    const entries = new Map<string, GenericFileEntry>();

    for (const entry of grfArchive.getEntries()) {
      entries.set(entry.relativePath, {
        offset: entry.offset,
        size: entry.size,
        sizeCompressed: entry.sizeCompressedAligned,
      });
    }

    const fileStream = createWriteStream(filePath, { flags: 'r+' });

    return new GrfArchiveBuilder(
      filePath,
      grfArchive.versionMajor(),
      grfArchive.versionMinor(),
      fileStream,
      entries,
      chunks
    );
  }
}

function toBytesLE(num: number): number[] {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(num, 0);
  return Array.from(buffer);
}

async function writeGrfHeader(
  version: number,
  fileTableOffset: number,
  vFileCount: number,
  fileHandle: fs.promises.FileHandle
): Promise<void> {
  // Create a buffer for the GRF header
  const headerBuffer = Buffer.alloc(
    GRF_HEADER_MAGIC.length + GRF_FIXED_KEY.length + 4 + 4 + 4 + 4
  ); // Adjust the size as needed

  let offset = 0;

  // Write GRF header magic
  headerBuffer.write(GRF_HEADER_MAGIC, offset, 'ascii');
  offset += GRF_HEADER_MAGIC.length;

  // Write fixed key
  GRF_FIXED_KEY.forEach((byte) => {
    headerBuffer.writeUInt8(byte, offset);
    offset += 1;
  });

  // Write file table offset
  headerBuffer.writeUInt32LE(fileTableOffset, offset);
  offset += 4;

  // Write seed (0 in this case)
  headerBuffer.writeUInt32LE(0, offset);
  offset += 4;

  // Write file count
  headerBuffer.writeInt32LE(vFileCount, offset);
  offset += 4;

  // Write version
  headerBuffer.writeUInt32LE(version, offset);

  // Write the buffer to the file
  await fileHandle.write(headerBuffer);
}
