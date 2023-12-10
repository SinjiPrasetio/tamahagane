export const THOR_HEADER_MAGIC: Uint8Array = new Uint8Array([
  65, 83, 83, 70, 32, 40, 67, 41, 32, 50, 48, 48, 55, 32, 65, 101, 111, 109,
  105, 110, 32, 68, 69, 86,
]);
export const INTEGRITY_FILE_NAME: string = 'data.integrity';
export const MULTIPLE_FILES_TABLE_DESC_SIZE: number = 2 * 4; // 2 * size of i32 (4 bytes)
export const MAX_FILE_NAME_SIZE = 256;
export const HEADER_MAX_SIZE =
  THOR_HEADER_MAGIC.length + 0x8 + MAX_FILE_NAME_SIZE;
export const SINGLE_FILE_ENTRY_MAX_SIZE = 9 + MAX_FILE_NAME_SIZE;
export const THOR_HEADER_FIXED_SIZE = THOR_HEADER_MAGIC.length + 0x8;
