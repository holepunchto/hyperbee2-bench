// Acceptable PRNG that can be used with a fixed seed to produce
// more comparable results across separate benchmark runs
export function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Generates number from 0 - 1 using Box-Muller transform on top
// of regular PRNG.
export function boxMuller(seed) {
  const rand = mulberry32(seed);
  return () => {
    while (true) {
      let u = 0, v = 0;
      while(u === 0) u = rand(); //Converting [0,1) to (0,1)
      while(v === 0) v = rand();
      let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
      num = num / 10.0 + 0.5; // Translate to 0 -> 1
      if (num > 1 || num < 0) continue; // resample between 0 and 1
      return num
    }
  }
}

export function makeRandomBuffer(length, rand) {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    buf[i] = rand() * 255;
  }
  return buf;
}

export class KeyGenerator {
  constructor(prng) {
    this.rand = prng(1234567890);
    this.buckets = new Array(16).fill(0);
  }

  generateBytes(length) {
    const buf = makeRandomBuffer(length, this.rand);
    const nibble = (buf[0] & 0xf0) >> 4;
    this.buckets[nibble]++;
    return buf;
  }
}

export const randomGenerators = [
  {name: 'mulberry32', generate: mulberry32},
  {name: 'boxMuller', generate: boxMuller},
];
