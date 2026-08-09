/**
 * Deterministic paper grain shared by the table surface and card stock.
 *
 * The path is generated once at module load, so every surface uses the same
 * quiet printed-fibre language without a repeating image tile or per-render
 * random noise.
 */
function createPaperGrainPath(): string {
  let seed = 0x6d2b79f5;
  const next = () => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };

  return Array.from({ length: 360 }, () => {
    const x = 1 + next() * 98;
    const y = 1 + next() * 98;
    const length = 0.25 + next() * 0.65;
    const angle = (next() - 0.5) * 0.5;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    return `M${x.toFixed(2)} ${y.toFixed(2)}l${dx.toFixed(2)} ${dy.toFixed(2)}`;
  }).join('');
}

export const PAPER_GRAIN_PATH = createPaperGrainPath();
