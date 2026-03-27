import { useState, useEffect, useRef } from 'react';

type Magnet = 'AUTO' | 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
type StrokeCap = 'NONE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL' | 'TRIANGLE_FILLED' | 'CIRCLE_FILLED' | 'DIAMOND_FILLED';
type LineType = 'ELBOW' | 'STRAIGHT' | 'CURVED';

interface ConnectSettings {
  sourceMagnet: Magnet; targetMagnet: Magnet;
  startCap: StrokeCap; endCap: StrokeCap;
  strokeWeight: number; lineType: LineType;
  sourceOffset: number; targetOffset: number;
  color: string;
}

// ─── Icons (inline SVG as React components) ────────────────────────────────

function IconElbow() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
      <path d="M1 7h6v-6h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconStraight() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
      <path d="M1 13L19 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconCurved() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
      <path d="M1 13 C5 13 7 1 10 1 C13 1 15 13 19 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CAPS: { label: string; value: StrokeCap; title: string }[] = [
  { label: '—', value: 'NONE', title: 'None' },
  { label: '→', value: 'ARROW_LINES', title: 'Arrow' },
  { label: '▶', value: 'TRIANGLE_FILLED', title: 'Triangle' },
  { label: '◆', value: 'DIAMOND_FILLED', title: 'Diamond' },
  { label: '●', value: 'CIRCLE_FILLED', title: 'Circle' },
];

const LINE_TYPES: { label: string; value: LineType; icon: React.ReactNode }[] = [
  { label: 'Elbow', value: 'ELBOW', icon: <IconElbow /> },
  { label: 'Straight', value: 'STRAIGHT', icon: <IconStraight /> },
  { label: 'Curved', value: 'CURVED', icon: <IconCurved /> },
];

const ANCHOR_SIDES: Magnet[] = ['AUTO', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT'];

// ─── Sub-components ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={css.label}>{children}</div>;
}

function PillGroup<T extends string>({
  options, value, onChange,
}: {
  options: { label: string; value: T; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={css.pillGroup}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          style={{ ...css.pill, ...(value === o.value ? css.pillActive : {}) }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Anchor editor ─────────────────────────────────────────────────────────

type BoxDef = { x: number; y: number; w: number; h: number };

function anchorPos(box: BoxDef, side: Magnet): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  switch (side) {
    case 'AUTO':   return { x: cx, y: cy };
    case 'TOP':    return { x: cx, y: box.y };
    case 'BOTTOM': return { x: cx, y: box.y + box.h };
    case 'LEFT':   return { x: box.x, y: cy };
    case 'RIGHT':  return { x: box.x + box.w, y: cy };
  }
}

function AnchorDot({
  x, y, side, active, onClick,
}: {
  x: number; y: number;
  side: Magnet;
  active: boolean;
  onClick: () => void;
}) {
  const isAuto = side === 'AUTO';
  const r = 5;
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Invisible hit area */}
      <circle cx={x} cy={y} r={10} fill="transparent" />
      <circle
        cx={x} cy={y} r={r}
        fill={active ? '#0d99ff' : '#f8f8f8'}
        stroke={active ? '#0d99ff' : '#c4c4c4'}
        strokeWidth={1.5}
        strokeDasharray={isAuto && !active ? '2.2 1.4' : undefined}
      />
      {isAuto && !active && (
        <text
          x={x} y={y + 3.5}
          textAnchor="middle"
          fontSize={5.5}
          fontWeight="700"
          fill="#aaa"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          A
        </text>
      )}
    </g>
  );
}

function AnchorEditor({
  sourceMagnet, targetMagnet, onSourceChange, onTargetChange, activeState,
}: {
  sourceMagnet: Magnet;
  targetMagnet: Magnet;
  onSourceChange: (m: Magnet) => void;
  onTargetChange: (m: Magnet) => void;
  activeState: 'none' | 'source' | 'both';
}) {
  // Box geometry (within a 296×78 viewBox)
  const srcBox: BoxDef = { x: 14, y: 13, w: 58, h: 40 };
  const tgtBox: BoxDef = { x: 224, y: 13, w: 58, h: 40 };

  const srcPt = anchorPos(srcBox, sourceMagnet);
  const tgtPt = anchorPos(tgtBox, targetMagnet);

  const srcActive = activeState === 'source' || activeState === 'both';
  const tgtActive = activeState === 'both';

  return (
    <svg viewBox="0 0 296 78" width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <marker
          id="ae-arrow"
          viewBox="0 0 8 8"
          refX="5" refY="4"
          markerWidth="5" markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 1 L6 4 L0 7 Z" fill="#0d99ff" opacity={0.7} />
        </marker>
      </defs>

      {/* ── Source box ── */}
      <rect
        x={srcBox.x} y={srcBox.y} width={srcBox.w} height={srcBox.h}
        rx={5}
        fill={srcActive ? '#f0f6ff' : '#f7f7f7'}
        stroke={srcActive ? '#0d99ff' : '#e0e0e0'}
        strokeWidth={1.5}
      />

      {/* ── Target box ── */}
      <rect
        x={tgtBox.x} y={tgtBox.y} width={tgtBox.w} height={tgtBox.h}
        rx={5}
        fill={tgtActive ? '#f0f6ff' : '#f7f7f7'}
        stroke={tgtActive ? '#0d99ff' : '#e0e0e0'}
        strokeWidth={1.5}
      />

      {/* ── Connector line between active anchors ── */}
      <line
        x1={srcPt.x} y1={srcPt.y}
        x2={tgtPt.x} y2={tgtPt.y}
        stroke="#0d99ff"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.55}
        markerEnd="url(#ae-arrow)"
      />

      {/* ── Source anchor dots ── */}
      {ANCHOR_SIDES.map(side => {
        const p = anchorPos(srcBox, side);
        return (
          <AnchorDot
            key={`src-${side}`}
            x={p.x} y={p.y}
            side={side}
            active={sourceMagnet === side}
            onClick={() => onSourceChange(side)}
          />
        );
      })}

      {/* ── Target anchor dots ── */}
      {ANCHOR_SIDES.map(side => {
        const p = anchorPos(tgtBox, side);
        return (
          <AnchorDot
            key={`tgt-${side}`}
            x={p.x} y={p.y}
            side={side}
            active={targetMagnet === side}
            onClick={() => onTargetChange(side)}
          />
        );
      })}

      {/* ── Box labels ── */}
      <text
        x={srcBox.x + srcBox.w / 2} y={74}
        textAnchor="middle" fontSize={9} fontWeight="600"
        fill="#c0c0c0"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        Source
      </text>
      <text
        x={tgtBox.x + tgtBox.w / 2} y={74}
        textAnchor="middle" fontSize={9} fontWeight="600"
        fill="#c0c0c0"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        Target
      </text>
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function App() {
  const [flash, setFlash] = useState<{ source: string; target: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [anchorState, setAnchorState] = useState<'none' | 'source' | 'both'>('none');

  const [sourceMagnet, setSourceMagnet] = useState<Magnet>('AUTO');
  const [targetMagnet, setTargetMagnet] = useState<Magnet>('AUTO');
  const [startCap, setStartCap] = useState<StrokeCap>('NONE');
  const [endCap, setEndCap] = useState<StrokeCap>('ARROW_LINES');
  const [strokeWeight, setStrokeWeight] = useState(2);
  const [lineType, setLineType] = useState<LineType>('ELBOW');
  const [sourceOffset, setSourceOffset] = useState(0);
  const [targetOffset, setTargetOffset] = useState(0);
  const [color, setColor] = useState('#000000');
  const [hexInput, setHexInput] = useState('000000');

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s: ConnectSettings = { sourceMagnet, targetMagnet, startCap, endCap, strokeWeight, lineType, sourceOffset, targetOffset, color };
    parent.postMessage({ pluginMessage: { type: 'update-settings', settings: s } }, '*');
  }, [sourceMagnet, targetMagnet, startCap, endCap, strokeWeight, lineType, sourceOffset, targetOffset, color]);

  useEffect(() => {
    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      if (!msg) return;
      if (msg.type === 'state-update') {
        setErrorMsg(null);
        setAnchorState(msg.source ? 'source' : 'none');
      }
      if (msg.type === 'connected') {
        setErrorMsg(null);
        setAnchorState('both');
        if (flashTimer.current) clearTimeout(flashTimer.current);
        setFlash({ source: msg.source.name, target: msg.target.name });
        flashTimer.current = setTimeout(() => setFlash(null), 2500);
      }
      if (msg.type === 'error') setErrorMsg(msg.message);
    };
  }, []);

  return (
    <div style={css.root}>

      {/* ── Toast notification ── */}
      <div style={{ ...css.toast, ...(flash ? css.toastIn : css.toastOut) }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="7" cy="7" r="6" fill="#14ae5c"/>
          <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={css.toastText}>
          <b>{flash?.source}</b>
          <span style={{ margin: '0 5px', opacity: 0.5 }}>→</span>
          <b>{flash?.target}</b>
        </span>
      </div>

      {/* ── Line type ── */}
      <div style={css.card}>
        <Label>Line type</Label>
        <div style={css.segmented}>
          {LINE_TYPES.map((lt) => (
            <button
              key={lt.value}
              style={{ ...css.seg, ...(lineType === lt.value ? css.segActive : {}) }}
              onClick={() => setLineType(lt.value)}
            >
              <span style={{ color: lineType === lt.value ? '#0d99ff' : '#888' }}>{lt.icon}</span>
              <span style={css.segLabel}>{lt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Connection points (visual anchor editor) ── */}
      <div style={css.card}>
        <Label>Connection points</Label>
        <AnchorEditor
          sourceMagnet={sourceMagnet}
          targetMagnet={targetMagnet}
          onSourceChange={setSourceMagnet}
          onTargetChange={setTargetMagnet}
          activeState={anchorState}
        />
      </div>

      {/* ── Arrowheads ── */}
      <div style={css.card}>
        <Label>Arrowheads</Label>
        <div style={css.twoCol}>
          <div style={css.colItem}>
            <div style={css.colLabel}>Start</div>
            <PillGroup options={CAPS} value={startCap} onChange={setStartCap} />
          </div>
          <div style={css.colItem}>
            <div style={css.colLabel}>End</div>
            <PillGroup options={CAPS} value={endCap} onChange={setEndCap} />
          </div>
        </div>
      </div>

      {/* ── Stroke & Offset ── */}
      <div style={css.card}>
        {/* Stroke weight — full width */}
        <div style={{ ...css.colItem, gap: 6 }}>
          <Label>Stroke weight</Label>
          <div style={css.sliderRow}>
            <input
              type="range" min={1} max={16} value={strokeWeight}
              onChange={(e) => setStrokeWeight(Number(e.target.value))}
              style={css.slider}
            />
            <input
              type="number"
              min={1} max={16} value={strokeWeight}
              onChange={(e) => {
                const v = Math.min(16, Math.max(1, Number(e.target.value)));
                if (!isNaN(v) && v > 0) setStrokeWeight(v);
              }}
              style={css.strokeNumInput}
            />
          </div>
        </div>

        <div style={css.divider} />

        {/* Offset — source + target */}
        <Label>Offset</Label>
        <div style={css.twoCol}>
          <div style={css.colItem}>
            <div style={css.colLabel}>Source</div>
            <div style={css.stepper}>
              <button style={css.stepBtn} onClick={() => setSourceOffset(v => v - 1)}>−</button>
              <input
                type="number" value={sourceOffset}
                onChange={(e) => setSourceOffset(Number(e.target.value))}
                style={css.stepInput}
              />
              <button style={css.stepBtn} onClick={() => setSourceOffset(v => v + 1)}>+</button>
            </div>
          </div>
          <div style={css.colItem}>
            <div style={css.colLabel}>Target</div>
            <div style={css.stepper}>
              <button style={css.stepBtn} onClick={() => setTargetOffset(v => v - 1)}>−</button>
              <input
                type="number" value={targetOffset}
                onChange={(e) => setTargetOffset(Number(e.target.value))}
                style={css.stepInput}
              />
              <button style={css.stepBtn} onClick={() => setTargetOffset(v => v + 1)}>+</button>
            </div>
          </div>
        </div>

        <div style={css.divider} />

        <div style={css.colItem}>
          <Label>Color</Label>
          <div style={css.colorRow}>
            {/* Native color swatch */}
            <div style={css.swatchWrap}>
              <div style={{ ...css.swatch, background: color }} />
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  const hex = e.target.value;
                  setColor(hex);
                  setHexInput(hex.replace('#', ''));
                }}
                style={css.colorNative}
              />
            </div>
            {/* Hash prefix */}
            <span style={css.colorHash}>#</span>
            {/* Hex text input */}
            <input
              type="text"
              maxLength={6}
              value={hexInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                setHexInput(raw);
                if (raw.length === 6) {
                  setColor('#' + raw);
                }
              }}
              onBlur={() => {
                const padded = hexInput.padEnd(6, '0');
                setHexInput(padded);
                setColor('#' + padded);
              }}
              style={css.hexInput}
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div style={css.error}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="6" cy="6" r="5" stroke="#e03" strokeWidth="1.2"/>
            <path d="M6 3.5v3M6 8.5v.5" stroke="#e03" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontSize: 12,
    color: '#1a1a1a',
    background: '#f0f0f0',
    minHeight: '100vh',
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    boxSizing: 'border-box',
  },

  // Toast
  toast: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #d0f0de',
    borderRadius: 8,
    fontSize: 12,
    transition: 'opacity 0.25s ease, transform 0.25s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  toastIn:  { opacity: 1, transform: 'translateY(0)' },
  toastOut: { opacity: 0, transform: 'translateY(-6px)', pointerEvents: 'none', border: '1px solid transparent', background: 'transparent', boxShadow: 'none' },
  toastText: { color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // Card
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: '11px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },

  // Labels
  label: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#999',
  },
  colLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#bbb',
    marginBottom: 4,
  },

  // Segmented control
  segmented: {
    display: 'flex',
    gap: 4,
  },
  seg: {
    flex: 1,
    padding: '7px 4px 6px',
    border: '1px solid #ebebeb',
    borderRadius: 7,
    background: '#fafafa',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.12s ease',
  },
  segActive: {
    background: '#f0f6ff',
    border: '1px solid #c5deff',
  },
  segLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
  },

  // Two-column layout
  twoCol: { display: 'flex', gap: 12 },
  colItem: { display: 'flex', flexDirection: 'column', flex: 1 },

  // Pill group (cap selectors)
  pillGroup: { display: 'flex', gap: 3 },
  pill: {
    flex: 1,
    height: 26,
    border: '1px solid #ebebeb',
    borderRadius: 5,
    background: '#fafafa',
    cursor: 'pointer',
    fontSize: 12,
    color: '#888',
    padding: 0,
    transition: 'all 0.1s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    background: '#0d99ff',
    borderColor: '#0d99ff',
    color: '#fff',
  },

  // Slider
  sliderRow: { display: 'flex', alignItems: 'center', gap: 8 },
  slider: { flex: 1, accentColor: '#0d99ff', height: 4 },
  sliderVal: { fontSize: 11, color: '#888', width: 28, textAlign: 'right', flexShrink: 0 },
  strokeNumInput: {
    width: 54,
    height: 26,
    border: '1px solid #ebebeb',
    borderRadius: 5,
    fontSize: 12,
    color: '#1a1a1a',
    background: '#fafafa',
    paddingLeft: 7,
    paddingRight: 2,
    flexShrink: 0,
    boxSizing: 'border-box' as const,
  },

  // Stepper
  stepper: { display: 'flex', alignItems: 'center', gap: 3 },
  stepBtn: {
    width: 26, height: 26,
    border: '1px solid #ebebeb',
    borderRadius: 5,
    background: '#fafafa',
    cursor: 'pointer',
    fontSize: 14,
    color: '#666',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepInput: {
    flex: 1,
    height: 26,
    border: '1px solid #ebebeb',
    borderRadius: 5,
    textAlign: 'center' as const,
    fontSize: 12,
    color: '#1a1a1a',
    background: '#fafafa',
    padding: '0 2px',
    width: 0,
    minWidth: 0,
  },

  // Divider
  divider: { height: 1, background: '#f0f0f0', margin: '2px 0' },

  // Color picker
  colorRow: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  swatchWrap: {
    position: 'relative', width: 26, height: 26, flexShrink: 0,
    borderRadius: 5, overflow: 'hidden',
    border: '1px solid #ddd', cursor: 'pointer',
  },
  swatch: {
    position: 'absolute', inset: 0,
    borderRadius: 4,
  },
  colorNative: {
    position: 'absolute', inset: 0,
    opacity: 0, cursor: 'pointer', width: '100%', height: '100%', padding: 0, border: 'none',
  },
  colorHash: {
    fontSize: 12, color: '#bbb', fontWeight: 500, userSelect: 'none',
  },
  hexInput: {
    flex: 1, height: 26,
    border: '1px solid #ebebeb', borderRadius: 5,
    fontSize: 12, fontFamily: "'SF Mono', 'Fira Mono', monospace",
    color: '#1a1a1a', background: '#fafafa',
    padding: '0 8px', letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },

  // Error
  error: {
    display: 'flex', alignItems: 'flex-start', gap: 7,
    padding: '9px 12px',
    background: '#fff5f5',
    border: '1px solid #ffd0d0',
    borderRadius: 8,
    fontSize: 11,
    color: '#c00',
    wordBreak: 'break-word' as const,
  },
};
