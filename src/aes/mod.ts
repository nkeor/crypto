import { toUint8Array } from "../utils/helpers.ts";
import { pad, Padding, unpad } from "../utils/padding.ts";

enum Mode {
  ECB = 1,
  CBC,
}

function xtime(x: number) {
  return ((x & 0x80) ? ((x << 1) ^ 0x1b) : (x << 1));
}

export interface AESOptions {
  mode?: Mode;
  iv?: Uint8Array | string;
  padding?: Padding;
}

export class AES {
  static readonly MODE = Mode;
  static readonly PADDING = Padding;

  private key: Uint8Array;
  private mode = Mode.ECB;
  private iv?: Uint8Array;
  private padding = Padding.PKCS7;

  constructor(key: Uint8Array | string, options?: AESOptions) {
    if (options) {
      options.iv && (this.iv = toUint8Array(options.iv));
      options.mode && (this.mode = options.mode);
      options.padding && (this.padding = options.padding);
    }

    if (this.mode === Mode.CBC) {
      if (!this.iv) {
        throw new Error("IV is not set.");
      }
      if (this.iv.length !== 16) {
        throw new Error("IV should be 16 bytes long.");
      }
    }

    key = toUint8Array(key);

    if (![16, 24, 32].includes(key.length)) {
      throw new Error("Key should be 16, 24 or 32 bytes long");
    }

    this.key = AES.keyExpansion(key);
  }

  private static rotWord(ks: Uint8Array, column: number) {
    const offset = column * 4;
    const tmp = ks[offset];
    ks[offset] = ks[offset + 1];
    ks[offset + 1] = ks[offset + 2];
    ks[offset + 2] = ks[offset + 3];
    ks[offset + 3] = tmp;
  }

  private static subWord(ks: Uint8Array, column: number) {
    const offset = column * 4;
    for (let i = 0; i < 4; i++) {
      ks[offset + i] = AES.SBOX[ks[offset + i]];
    }
  }

  private static keyExpansion(key: Uint8Array) {
    const nb = 4;
    const nk = key.length / 4;
    const nr = nk + 6;
    const ks = new Uint8Array(16 * (nr + 1));
    ks.set(key, 0);

    for (let i = nk; i < (nb * (nr + 1)); i++) {
      const prevOffset = (i - nk) * 4;
      const offset = i * 4;

      ks[offset] = ks[offset - 4];
      ks[offset + 1] = ks[offset - 3];
      ks[offset + 2] = ks[offset - 2];
      ks[offset + 3] = ks[offset - 1];

      if (i % nk === 0) {
        AES.rotWord(ks, i);
        AES.subWord(ks, i);
        ks[offset] ^= AES.RCON[i / nk];
      } else if (nk > 6 && i % nk === 4) {
        AES.subWord(ks, i);
      }

      ks[offset] ^= ks[prevOffset];
      ks[offset + 1] ^= ks[prevOffset + 1];
      ks[offset + 2] ^= ks[prevOffset + 2];
      ks[offset + 3] ^= ks[prevOffset + 3];
    }
    return ks;
  }

  private addRoundKey(state: Uint8Array, round: number) {
    for (let i = 0; i < 16; i++) {
      state[i] ^= this.key[round * 16 + i];
    }
  }

  private static subBytes(state: Uint8Array) {
    for (let i = 0; i < 16; i++) {
      state[i] = AES.SBOX[state[i]];
    }
  }

  private static invSubBytes(state: Uint8Array) {
    for (let i = 0; i < 16; i++) {
      state[i] = AES.RSBOX[state[i]];
    }
  }

  private static shiftRows(state: Uint8Array) {
    let t = state[1];

    state[1] = state[5];
    state[5] = state[9];
    state[9] = state[13];
    state[13] = t;

    t = state[10];
    state[10] = state[2];
    state[2] = t;
    t = state[14];
    state[14] = state[6];
    state[6] = t;

    t = state[15];
    state[15] = state[11];
    state[11] = state[7];
    state[7] = state[3];
    state[3] = t;
  }

  private static invShiftRows(state: Uint8Array) {
    let t = state[13];
    state[13] = state[9];
    state[9] = state[5];
    state[5] = state[1];
    state[1] = t;

    t = state[10];
    state[10] = state[2];
    state[2] = t;
    t = state[14];
    state[14] = state[6];
    state[6] = t;

    t = state[3];
    state[3] = state[7];
    state[7] = state[11];
    state[11] = state[15];
    state[15] = t;
  }

  private static mixColumns(state: Uint8Array) {
    let a, b, c, d, e;

    for (let i = 0; i < 16; i += 4) {
      a = state[i];
      b = state[i + 1];
      c = state[i + 2];
      d = state[i + 3];
      e = a ^ b ^ c ^ d;

      state[i] ^= e ^ xtime(a ^ b);
      state[i + 1] ^= e ^ xtime(b ^ c);
      state[i + 2] ^= e ^ xtime(c ^ d);
      state[i + 3] ^= e ^ xtime(d ^ a);
    }
  }

  private static invMixColumns(state: Uint8Array) {
    let a, b, c, d, e, x, y, z;

    for (let i = 0; i < 16; i += 4) {
      a = state[i];
      b = state[i + 1];
      c = state[i + 2];
      d = state[i + 3];
      e = a ^ b ^ c ^ d;

      z = xtime(e);
      x = e ^ xtime(xtime(z ^ a ^ c));
      y = e ^ xtime(xtime(z ^ b ^ d));

      state[i] ^= x ^ xtime(a ^ b);
      state[i + 1] ^= y ^ xtime(b ^ c);
      state[i + 2] ^= x ^ xtime(c ^ d);
      state[i + 3] ^= y ^ xtime(d ^ a);
    }
  }

  private encryptBlock(data: Uint8Array) {
    const nr = this.key.length / 16 - 1;

    const state = data.slice();
    this.addRoundKey(state, 0);

    for (let i = 1; i < nr; i++) {
      AES.subBytes(state);
      AES.shiftRows(state);
      AES.mixColumns(state);
      this.addRoundKey(state, i);
    }

    AES.subBytes(state);
    AES.shiftRows(state);
    this.addRoundKey(state, nr);

    return state;
  }

  private decryptBlock(data: Uint8Array) {
    const nr = this.key.length / 16 - 1;

    const state = data.slice();
    this.addRoundKey(state, nr);

    for (let i = nr - 1; i > 0; i--) {
      AES.invShiftRows(state);
      AES.invSubBytes(state);
      this.addRoundKey(state, i);
      AES.invMixColumns(state);
    }

    AES.invShiftRows(state);
    AES.invSubBytes(state);
    this.addRoundKey(state, 0);

    return state;
  }

  encrypt(data: Uint8Array) {
    data = pad(data.slice(), this.padding, 16);
    const encrypted = new Uint8Array(data.length);

    if (this.mode == Mode.ECB) {
      for (let i = 0; i < data.length; i += 16) {
        const block = this.encryptBlock(data.subarray(i, i + 16));
        encrypted.set(block, i);
      }
      return encrypted;
    } else if (this.mode == Mode.CBC) {
      let prev = this.iv!;

      for (let i = 0; i < data.length; i += 16) {
        const block = data.subarray(i, i + 16);
        for (let j = 0; j < 16; j++) {
          block[j] ^= prev[j];
        }

        const enc = this.encryptBlock(block);
        encrypted.set(enc, i);
        prev = enc;
      }
      return encrypted;
    } else {
      throw new Error("Unsupported Mode.");
    }
  }

  decrypt(data: Uint8Array) {
    if (data.length % 16 !== 0) {
      throw new Error("Input should be multiple of 16");
    }

    const decrypted = new Uint8Array(data.length);

    if (this.mode == Mode.ECB) {
      for (let i = 0; i < data.length; i += 16) {
        const block = this.decryptBlock(data.subarray(i, i + 16));
        decrypted.set(block, i);
      }
    } else if (this.mode == Mode.CBC) {
      let prev = this.iv!;

      for (let i = 0; i < data.length; i += 16) {
        const block = data.subarray(i, i + 16);
        const enc = this.decryptBlock(block);

        for (let i = 0; i < 16; i++) {
          enc[i] ^= prev[i];
        }

        decrypted.set(enc, i);
        prev = block;
      }
    } else {
      throw new Error("Unsupported Mode.");
    }

    return unpad(decrypted, this.padding, 16);
  }

  // deno-fmt-ignore
  private static readonly RCON: readonly number[] = [
    0x8d,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36
  ]

  // deno-fmt-ignore
  private static readonly SBOX: readonly number[] = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
  ];

  // deno-fmt-ignore
  private static readonly RSBOX: readonly number[] = [
    0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
    0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
    0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
    0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
    0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
    0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
    0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
    0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
    0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
    0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
    0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
    0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
    0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
    0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
    0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
    0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d,
  ];
}