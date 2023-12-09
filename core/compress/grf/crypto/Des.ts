export const SHIFTS: number[] = [
  1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1,
];

const SBOXES: number[][] = [
  [
    14, 0, 4, 15, 13, 7, 1, 4, 2, 14, 15, 2, 11, 13, 8, 1, 3, 10, 10, 6, 6, 12,
    12, 11, 5, 9, 9, 5, 0, 3, 7, 8, 4, 15, 1, 12, 14, 8, 8, 2, 13, 4, 6, 9, 2,
    1, 11, 7, 15, 5, 12, 11, 9, 3, 7, 14, 3, 10, 10, 0, 5, 6, 0, 13,
  ],
  [
    15, 3, 1, 13, 8, 4, 14, 7, 6, 15, 11, 2, 3, 8, 4, 14, 9, 12, 7, 0, 2, 1, 13,
    10, 12, 6, 0, 9, 5, 11, 10, 5, 0, 13, 14, 8, 7, 10, 11, 1, 10, 3, 4, 15, 13,
    4, 1, 2, 5, 11, 8, 6, 12, 7, 6, 12, 9, 0, 3, 5, 2, 14, 15, 9,
  ],
  [
    10, 13, 0, 7, 9, 0, 14, 9, 6, 3, 3, 4, 15, 6, 5, 10, 1, 2, 13, 8, 12, 5, 7,
    14, 11, 12, 4, 11, 2, 15, 8, 1, 13, 1, 6, 10, 4, 13, 9, 0, 8, 6, 15, 9, 3,
    8, 0, 7, 11, 4, 1, 15, 2, 14, 12, 3, 5, 11, 10, 5, 14, 2, 7, 12,
  ],
  [
    7, 13, 13, 8, 14, 11, 3, 5, 0, 6, 6, 15, 9, 0, 10, 3, 1, 4, 2, 7, 8, 2, 5,
    12, 11, 1, 12, 10, 4, 14, 15, 9, 10, 3, 6, 15, 9, 0, 0, 6, 12, 10, 11, 1, 7,
    13, 13, 8, 15, 9, 1, 4, 3, 5, 14, 11, 5, 12, 2, 7, 8, 2, 4, 14,
  ],
  [
    2, 14, 12, 11, 4, 2, 1, 12, 7, 4, 10, 7, 11, 13, 6, 1, 8, 5, 5, 0, 3, 15,
    15, 10, 13, 3, 0, 9, 14, 8, 9, 6, 4, 11, 2, 8, 1, 12, 11, 7, 10, 1, 13, 14,
    7, 2, 8, 13, 15, 6, 9, 15, 12, 0, 5, 9, 6, 10, 3, 4, 0, 5, 14, 3,
  ],
  [
    12, 10, 1, 15, 10, 4, 15, 2, 9, 7, 2, 12, 6, 9, 8, 5, 0, 6, 13, 1, 3, 13, 4,
    14, 14, 0, 7, 11, 5, 3, 11, 8, 9, 4, 14, 3, 15, 2, 5, 12, 2, 9, 8, 5, 12,
    15, 3, 10, 7, 11, 0, 14, 4, 1, 10, 7, 1, 6, 13, 0, 11, 8, 6, 13,
  ],
  [
    4, 13, 11, 0, 2, 11, 14, 7, 15, 4, 0, 9, 8, 1, 13, 10, 3, 14, 12, 3, 9, 5,
    7, 12, 5, 2, 10, 15, 6, 8, 1, 6, 1, 6, 4, 11, 11, 13, 13, 8, 12, 1, 3, 4, 7,
    10, 14, 7, 10, 9, 15, 5, 6, 0, 8, 15, 0, 14, 5, 2, 9, 3, 2, 12,
  ],
  [
    13, 1, 2, 15, 8, 13, 4, 8, 6, 10, 15, 3, 11, 7, 1, 4, 10, 12, 9, 5, 3, 6,
    14, 11, 5, 0, 0, 14, 12, 9, 7, 2, 7, 2, 11, 1, 4, 14, 1, 7, 9, 4, 12, 10,
    14, 8, 2, 13, 0, 15, 6, 12, 10, 9, 13, 0, 15, 3, 3, 5, 5, 6, 8, 11,
  ],
];

export class DesEncryptor {
  public keys: number[];

  constructor() {
    this.keys = new Array(16).fill(0); // Initialize with zeroes
  }
}

function deltaSwap(a: bigint, delta: bigint, mask: bigint): bigint {
  const b = (a ^ (a >> delta)) & mask;
  return a ^ b ^ (b << delta);
}

function pc1(key: bigint): bigint {
  key = deltaSwap(key, BigInt(2), BigInt('0x3333000033330000'));
  key = deltaSwap(key, BigInt(4), BigInt('0x0f0f0f0f00000000'));
  key = deltaSwap(key, BigInt(8), BigInt('0x009a000a00a200a8'));
  key = deltaSwap(key, BigInt(16), BigInt('0x00006c6c0000cccc'));
  key = deltaSwap(key, BigInt(1), BigInt('0x1045500500550550'));
  key = deltaSwap(key, BigInt(32), BigInt('0x00000000f0f0f5fa'));
  key = deltaSwap(key, BigInt(8), BigInt('0x00550055006a00aa'));
  key = deltaSwap(key, BigInt(2), BigInt('0x0000333330000300'));
  return key & BigInt('0xFFFFFFFFFFFFFF00');
}

function pc2(key: bigint): bigint {
  const keyRotated = rotateLeftBigInt(key, BigInt(61));
  const b1 = (keyRotated & BigInt('0x0021000002000000')) >> BigInt(7);
  const b2 = (keyRotated & BigInt('0x0008020010080000')) << BigInt(1);
  const b3 = keyRotated & BigInt('0x0002200000000000');
  const b4 = (keyRotated & BigInt('0x0000000000100020')) << BigInt(19);
  const b5 =
    ((rotateLeftBigInt(keyRotated, BigInt(54)) & BigInt('0x0005312400000011')) *
      BigInt('0x0000000094200201')) &
    BigInt('0xea40100880000000');
  const b6 =
    ((rotateLeftBigInt(keyRotated, BigInt(7)) & BigInt('0x0022110000012001')) *
      BigInt('0x0001000000610006')) &
    BigInt('0x1185004400000000');
  const b7 =
    ((rotateLeftBigInt(keyRotated, BigInt(6)) & BigInt('0x0000520040200002')) *
      BigInt('0x00000080000000c1')) &
    BigInt('0x0028811000200000');
  const b8 =
    ((keyRotated & BigInt('0x01000004c0011100')) *
      BigInt('0x0000000000004284')) &
    BigInt('0x0400082244400000');
  const b9 =
    ((rotateLeftBigInt(keyRotated, BigInt(60)) & BigInt('0x0000000000820280')) *
      BigInt('0x0000000000089001')) &
    BigInt('0x0000000110880000');
  const b10 =
    ((rotateLeftBigInt(keyRotated, BigInt(49)) & BigInt('0x0000000000024084')) *
      BigInt('0x0000000002040005')) &
    BigInt('0x000000000a030000');
  return b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 | b9 | b10;
}

function rotateLeftBigInt(value: bigint, shift: bigint): bigint {
  const mask = (BigInt('1') << BigInt('64')) - BigInt('1'); // 64-bit mask
  return ((value << shift) | (value >> (BigInt('64') - shift))) & mask;
}

function fp(message: bigint): bigint {
  message = deltaSwapBigInt(message, BigInt(24), BigInt('0x000000FF000000FF'));
  message = deltaSwapBigInt(message, BigInt(24), BigInt('0x00000000FF00FF00'));
  message = deltaSwapBigInt(message, BigInt(36), BigInt('0x000000000F0F0F0F'));
  message = deltaSwapBigInt(message, BigInt(18), BigInt('0x0000333300003333'));
  return deltaSwapBigInt(message, BigInt(9), BigInt('0x0055005500550055'));
}

function deltaSwapBigInt(a: bigint, delta: bigint, mask: bigint): bigint {
  const b = (a ^ (a >> delta)) & mask;
  return a ^ b ^ (b << delta);
}

function ipBigInt(message: bigint): bigint {
  message = deltaSwapBigInt(message, BigInt(9), BigInt('0x0055005500550055'));
  message = deltaSwapBigInt(message, BigInt(18), BigInt('0x0000333300003333'));
  message = deltaSwapBigInt(message, BigInt(36), BigInt('0x000000000F0F0F0F'));
  message = deltaSwapBigInt(message, BigInt(24), BigInt('0x00000000FF00FF00'));
  return deltaSwapBigInt(message, BigInt(24), BigInt('0x000000FF000000FF'));
}

function eBigInt(block: bigint): bigint {
  const BLOCK_LEN = BigInt(32);
  const RESULT_LEN = BigInt(48);

  const b1 = (block << (BLOCK_LEN - BigInt(1))) & BigInt('0x8000000000000000');
  const b2 = (block >> BigInt(1)) & BigInt('0x7C00000000000000');
  const b3 = (block >> BigInt(3)) & BigInt('0x03F0000000000000');
  const b4 = (block >> BigInt(5)) & BigInt('0x000FC00000000000');
  const b5 = (block >> BigInt(7)) & BigInt('0x00003F0000000000');
  const b6 = (block >> BigInt(9)) & BigInt('0x000000FC00000000');
  const b7 = (block >> BigInt(11)) & BigInt('0x00000003F0000000');
  const b8 = (block >> BigInt(13)) & BigInt('0x000000000FC00000');
  const b9 = (block >> BigInt(15)) & BigInt('0x00000000003E0000');
  const b10 =
    (block >> (RESULT_LEN - BigInt(1))) & BigInt('0x0000000000010000');
  return b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 | b9 | b10;
}

function pBigInt(block: bigint): bigint {
  block = rotateLeftBigInt(block, BigInt(44));
  const b1 = (block & BigInt('0x0000000000200000')) << BigInt(32);
  const b2 = (block & BigInt('0x0000000000480000')) << BigInt(13);
  const b3 = (block & BigInt('0x0000088000000000')) << BigInt(12);
  const b4 = (block & BigInt('0x0000002020120000')) << BigInt(25);
  const b5 = (block & BigInt('0x0000000442000000')) << BigInt(14);
  const b6 = (block & BigInt('0x0000000001800000')) << BigInt(37);
  const b7 = (block & BigInt('0x0000000004000000')) << BigInt(24);
  const b8 =
    ((block & BigInt('0x0000020280015000')) * BigInt('0x0000020080800083')) &
    BigInt('0x02000a6400000000');
  const b9 =
    rotateLeftBigInt(block, BigInt(29)) &
    (BigInt('0x01001400000000aa') * BigInt('0x0000210210008081')) &
    BigInt('0x0902c01200000000');
  const b10 =
    ((block & BigInt('0x0000000910040000')) * BigInt('0x0000000c04000020')) &
    BigInt('0x8410010000000000');
  return b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 | b9 | b10;
}

export function genKeysBigInt(key: bigint): bigint[] {
  const keys: bigint[] = new Array(16).fill(BigInt(0));
  let processedKey = pc1(key);

  processedKey = processedKey >> BigInt(8);

  let c = processedKey >> BigInt(28);
  let d = processedKey & BigInt('0x0FFFFFFF');
  for (let i = 0; i < 16; i++) {
    c = rotateBigInt(c, SHIFTS[i]);
    d = rotateBigInt(d, SHIFTS[i]);

    keys[i] = pc2(((c << BigInt(28)) | d) << BigInt(8));
  }

  return keys;
}

// Rotate the bits in a bigint
function rotateBigInt(value: bigint, shifts: number): bigint {
  const mask28bit = (BigInt(1) << BigInt(28)) - BigInt(1);
  return (
    ((value << BigInt(shifts)) | (value >> (BigInt(28) - BigInt(shifts)))) &
    mask28bit
  );
}

function roundBigInt(input: bigint, key: bigint): bigint {
  const l = input & (BigInt('0xFFFFFFFF') << BigInt(32));
  const r = input << BigInt(32);
  return r | ((fBigInt(r, key) ^ l) >> BigInt(32));
}

function fBigInt(input: bigint, key: bigint): bigint {
  let val = eBigInt(input);
  val ^= key;
  val = applySboxesBigInt(val);
  return pBigInt(val);
}

function applySboxesBigInt(input: bigint): bigint {
  let output: bigint = BigInt(0);
  for (let i = 0; i < SBOXES.length; i++) {
    const val = (input >> BigInt(58 - i * 6)) & BigInt('0x3F');
    output |= BigInt(SBOXES[i][Number(val)]) << BigInt(60 - i * 4);
  }
  return output;
}

export class DesDecryptor {
  keys: bigint[];

  constructor(keys: bigint[]) {
    this.keys = keys;
  }

  encryptBlock1Round(data: bigint): bigint {
    data = ipBigInt(data);
    data = roundBigInt(data, this.keys[0]);
    return fp((data << BigInt(32)) | (data >> BigInt(32)));
  }

  decryptBlock1Round(data: bigint): bigint {
    data = ipBigInt(data);
    data = roundBigInt(data, this.keys[this.keys.length - 1]);
    return fp((data << BigInt(32)) | (data >> BigInt(32)));
  }
}

// Implement ipBigInt, fpBigInt, eBigInt, and other required functions here
