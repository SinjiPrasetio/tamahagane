import CryptoJS from 'crypto-js';
import { DesDecryptor, genKeysBigInt } from './Des';

const DES_BLOCK_SIZE = 8;

export function decryptFileName(file_name: Uint8Array): Uint8Array {
  const mut_vec = new Uint8Array(file_name);
  swapNibbles(mut_vec);
  grfDecryptShuffled(0, 1, mut_vec);
  return removeZeroPadding(mut_vec);
}

export function decryptFileContent(
  data: Uint8Array | Buffer,
  cycle: number
): Uint8Array {
  if (cycle === 0) {
    grfDecryptFirstBlocks(0, data);
  } else {
    grfDecryptShuffled(0, cycle, data);
  }
  return data;
}

function swapNibbles(buffer: Uint8Array): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = (buffer[i] << 4) | (buffer[i] >> 4);
  }
}

function removeZeroPadding(vec: Uint8Array): Uint8Array {
  let lastNonZeroIndex = -1;
  for (let i = vec.length - 1; i >= 0; i--) {
    if (vec[i] !== 0) {
      lastNonZeroIndex = i;
      break;
    }
  }
  return vec.slice(0, lastNonZeroIndex + 1);
}

export function grfDecryptFirstBlocks(key: number, buffer: Uint8Array): void {
  const bufferLength = buffer.length;
  const bufferBlocks = Math.ceil(bufferLength / DES_BLOCK_SIZE);

  for (let i = 0; i < Math.min(bufferBlocks, 20); i++) {
    const blockStart = i * DES_BLOCK_SIZE;
    const blockEnd = Math.min(blockStart + DES_BLOCK_SIZE, bufferLength);
    const blockBuffer = buffer.slice(blockStart, blockEnd);

    // Convert block to WordArray for CryptoJS
    const wordArray = CryptoJS.lib.WordArray.create(blockBuffer);
    const keyHex = CryptoJS.enc.Hex.parse(key.toString(16));

    // Apply DES decryption to the block (this example uses standard DES decryption, not single-round)
    const decryptedBlock = CryptoJS.DES.decrypt(
      {
        ciphertext: wordArray,
      },
      keyHex,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding,
      }
    );

    // Replace the original block in the buffer with the decrypted block
    const decryptedBytes = new Uint8Array(decryptedBlock.sigBytes);
    for (let j = 0; j < decryptedBytes.length; j++) {
      buffer[blockStart + j] = decryptedBytes[j];
    }
  }
}

export function grfDecryptShuffled(
  key: number,
  cycle: number,
  buffer: Uint8Array
): void {
  const desCipher = genKeysBigInt(BigInt(key));
  const updatedCycle = updateCycle(cycle);
  const bufferLength = buffer.length;
  const bufferBlocks = Math.ceil(bufferLength / DES_BLOCK_SIZE);

  let j = 0;
  for (let i = 0; i < bufferBlocks; i++) {
    const blockStart = i * DES_BLOCK_SIZE;
    const blockEnd = Math.min(blockStart + DES_BLOCK_SIZE, bufferLength);
    const blockBuffer = buffer.slice(blockStart, blockEnd);

    if (i < 20 || i % updatedCycle === 0) {
      // Apply 1 round of DES to the block (this needs to be implemented)
      const des = new DesDecryptor(desCipher); // Assuming Des class handles both encryption and decryption
      const blockAsBigInt = bufferToBigInt(blockBuffer);
      const decryptedBlockBigInt = des.decryptBlock1Round(blockAsBigInt);
      const decryptedBlock = bigIntToBuffer(
        decryptedBlockBigInt,
        DES_BLOCK_SIZE
      );
      buffer.set(decryptedBlock, blockStart);
    } else {
      if (j === 7) {
        j = 0;
        // Shuffle bytes in the block
        shuffleBytes(blockBuffer);
      }
      j++;
    }
  }
}

function bufferToBigInt(buffer: Uint8Array): bigint {
  let value = BigInt(0);
  for (let i = 0; i < buffer.length; i++) {
    value = (value << BigInt(8)) + BigInt(buffer[i]);
  }
  return value;
}

function bigIntToBuffer(value: bigint, length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    buffer[length - 1 - i] = Number((value >> BigInt(8 * i)) & BigInt(0xff));
  }
  return buffer;
}

function updateCycle(cycle: number): number {
  if (cycle < 3) return 3;
  if (cycle < 5) return cycle + 1;
  if (cycle < 7) return cycle + 9;
  return cycle + 15;
}

function shuffleBytes(blockBuffer: Uint8Array): Uint8Array {
  // Assuming DES_BLOCK_SIZE is 8, adjust accordingly if different
  if (blockBuffer.length !== DES_BLOCK_SIZE) {
    throw new Error('Block size does not match DES_BLOCK_SIZE');
  }

  // Implement the byte shuffling logic here
  // For example: 3450162 (initial layout) to 0123456 (final layout)
  const shuffledBuffer = new Uint8Array(DES_BLOCK_SIZE);
  shuffledBuffer[0] = blockBuffer[3];
  shuffledBuffer[1] = blockBuffer[4];
  shuffledBuffer[2] = blockBuffer[5];
  shuffledBuffer[3] = blockBuffer[0];
  shuffledBuffer[4] = blockBuffer[1];
  shuffledBuffer[5] = blockBuffer[2];
  shuffledBuffer[6] = blockBuffer[6];
  shuffledBuffer[7] = permuteByte(blockBuffer[7]); // Assuming permuteByte function is defined

  return shuffledBuffer;
}

function permuteByte(b: number): number {
  const permutationMap: { [key: number]: number } = {
    0x00: 0x2b,
    0x01: 0x68,
    0x2b: 0x00,
    0x48: 0x77,
    0x60: 0xff,
    0x68: 0x01,
    0x6c: 0x80,
    0x77: 0x48,
    0x80: 0x6c,
    0xb9: 0xc0,
    0xc0: 0xb9,
    0xeb: 0xfe,
    0xfe: 0xeb,
    0xff: 0x60,
  };

  return permutationMap[b] ?? b;
}
