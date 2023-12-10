import GrfArchive from './GrfReader';
import { GRF_HEADER_SIZE } from './constants';

class AvailableChunk {
  size: number;

  constructor(size: number) {
    this.size = size;
  }
}

export class AvailableChunkList {
  private endOffset: number;
  private sizes: Set<string>; // Using strings as keys since JavaScript Sets/Maps only support primitives & objects as keys
  private chunks: Map<number, AvailableChunk>;

  constructor() {
    this.endOffset = GRF_HEADER_SIZE; // Assuming GRF_HEADER_SIZE is defined elsewhere
    this.sizes = new Set<string>();
    this.chunks = new Map<number, AvailableChunk>();
  }

  listAvailableChunks(archive: GrfArchive): AvailableChunkList {
    // Assuming GrfArchive is defined elsewhere with appropriate methods
    if (archive.fileCount() === 0) {
      return new AvailableChunkList();
    }

    const entries = Array.from(archive.getEntries());
    entries.sort((a, b) => a.offset - b.offset);

    const chunkList = new AvailableChunkList();

    for (let i = 0; i < entries.length - 1; i++) {
      const leftEntry = entries[i];
      const rightEntry = entries[i + 1];
      const expectedEntryOffset =
        leftEntry.offset + leftEntry.sizeCompressedAligned;
      const spaceBetweenEntries = rightEntry.offset - expectedEntryOffset;

      if (spaceBetweenEntries > 0) {
        chunkList.addChunk(expectedEntryOffset, spaceBetweenEntries);
      }
    }

    const lastEntry = entries[entries.length - 1];
    chunkList.endOffset = lastEntry.offset + lastEntry.sizeCompressedAligned;

    return chunkList;
  }

  private addChunk(offset: number, size: number) {
    this.sizes.add(this.makeSizeKey(size, offset));
    this.chunks.set(offset, { size });
  }

  private makeSizeKey(size: number, offset: number): string {
    return `${size}_${offset}`;
  }

  allocChunk(size: number): number {
    const chunkOffset = this.findSuitableChunk(size);
    if (chunkOffset === this.endOffset) {
      this.endOffset += size;
    } else {
      const chunk = this.chunks.get(chunkOffset);
      if (chunk && chunk.size > size) {
        const newSize = chunk.size - size;
        this.chunks.delete(chunkOffset);
        this.sizes.delete(this.makeSizeKey(chunk.size, chunkOffset));
        const newOffset = chunkOffset + size;
        this.insertChunkInternal(newOffset, newSize);
      }
    }
    return chunkOffset;
  }

  reallocChunk(offset: number, size: number, newSize: number): number {
    const endOffset = offset + size;
    if (endOffset === this.endOffset) {
      this.endOffset = offset + newSize;
      return offset;
    }

    const nextChunk = this.chunks.get(endOffset);
    if (nextChunk && size + nextChunk.size >= newSize) {
      this.chunks.delete(endOffset);
      this.sizes.delete(this.makeSizeKey(nextChunk.size, endOffset));
      const newChunkSize = size + nextChunk.size - newSize;
      this.insertChunkInternal(offset + newSize, newChunkSize);
      return offset;
    }

    this.freeChunk(offset, size);
    return this.allocChunk(newSize);
  }

  freeChunk(offset: number, size: number) {
    const chunkEndOffset = offset + size;
    let newChunkOffset = offset;
    let newChunkSize = size;

    const leftChunks = Array.from(this.chunks.keys()).filter(
      (key) => key < offset
    );
    if (leftChunks.length > 0) {
      const leftChunkOffset = leftChunks[leftChunks.length - 1];
      const leftChunk = this.chunks.get(leftChunkOffset);
      if (leftChunk && leftChunkOffset + leftChunk.size === offset) {
        newChunkOffset = leftChunkOffset;
        newChunkSize += leftChunk.size;
        this.chunks.delete(leftChunkOffset);
        this.sizes.delete(this.makeSizeKey(leftChunk.size, leftChunkOffset));
      }
    }

    if (chunkEndOffset === this.endOffset) {
      this.endOffset = newChunkOffset;
    } else if (this.chunks.has(chunkEndOffset)) {
      const rightChunk = this.chunks.get(chunkEndOffset);
      if (rightChunk) {
        newChunkSize += rightChunk.size;
        this.chunks.delete(chunkEndOffset);
        this.sizes.delete(this.makeSizeKey(rightChunk.size, chunkEndOffset));
      }
    }

    this.insertChunkInternal(newChunkOffset, newChunkSize);
  }

  private findSuitableChunk(size: number): number {
    for (const key of this.sizes) {
      const [chunkSize, offset] = this.parseSizeKey(key);
      if (chunkSize >= size) {
        return offset;
      }
    }
    return this.endOffset;
  }

  private insertChunkInternal(offset: number, size: number) {
    this.chunks.set(offset, new AvailableChunk(size));
    this.sizes.add(this.makeSizeKey(size, offset));
  }

  private parseSizeKey(key: string): [number, number] {
    const [size, offset] = key.split('_').map(Number);
    return [size, offset];
  }
}
