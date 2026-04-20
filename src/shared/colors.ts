// Shared types and helpers.
// Imported by both the plugin thread (code.ts) and the UI (App.tsx).
// Keep this file free of any figma.* / window.* references.

// ─── Connector settings ───────────────────────────────────────────────────

export type Magnet = 'AUTO' | 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
export type StrokeCap =
  | 'NONE'
  | 'ARROW_LINES'
  | 'ARROW_EQUILATERAL'
  | 'TRIANGLE_FILLED'
  | 'CIRCLE_FILLED'
  | 'DIAMOND_FILLED';
export type LineType = 'ELBOW' | 'STRAIGHT' | 'CURVED';

export interface ConnectSettings {
  sourceMagnet: Magnet;
  targetMagnet: Magnet;
  startCap: StrokeCap;
  endCap: StrokeCap;
  strokeWeight: number;
  lineType: LineType;
  sourceOffset: number;
  targetOffset: number;
  autoConnect: boolean;
}

// ─── Color presets ────────────────────────────────────────────────────────

export type PresetSlot = 'default' | 'positive' | 'negative';

export interface ColorPresets {
  default: string;   // '#RRGGBB'
  positive: string;
  negative: string;
  active: PresetSlot;
}

export const INITIAL_PRESETS: ColorPresets = {
  default:  '#000000',
  positive: '#14AE5C',
  negative: '#F24822',
  active:   'default',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validHex(v: unknown): string | null {
  if (typeof v === 'string' && HEX_RE.test(v)) return v;
  // Migrate from old ColorValue format: { kind: 'hex', hex: '#...' }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.kind === 'hex' && typeof o.hex === 'string' && HEX_RE.test(o.hex)) return o.hex;
    // Variable/style fallback
    if (typeof o.fallbackHex === 'string' && HEX_RE.test(o.fallbackHex)) return o.fallbackHex;
  }
  return null;
}

export function validatePresets(raw: unknown): ColorPresets {
  if (!raw || typeof raw !== 'object') return INITIAL_PRESETS;
  const r = raw as Record<string, unknown>;
  const active: PresetSlot =
    r.active === 'positive' || r.active === 'negative' ? r.active : 'default';
  return {
    default:  validHex(r.default)  ?? INITIAL_PRESETS.default,
    positive: validHex(r.positive) ?? INITIAL_PRESETS.positive,
    negative: validHex(r.negative) ?? INITIAL_PRESETS.negative,
    active,
  };
}

// ─── Color helpers ────────────────────────────────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const n = parseInt(full, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c * 255)))
      .toString(16)
      .padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
