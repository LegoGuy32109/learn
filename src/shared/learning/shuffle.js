// @ts-check
/** Deterministic PRNG/shuffle for checkpointed attempts. @param {number} seed */
export function mulberry32(seed) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** @template T @param {T[]} values @param {number} seed */
export function shuffled(values, seed) { const result = [...values], random = mulberry32(seed); for (let i=result.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; } return result; }
