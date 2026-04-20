import { useState, useEffect, useRef } from 'react';
import {
  ConnectSettings,
  Magnet,
  StrokeCap,
  LineType,
  ColorPresets,
  PresetSlot,
  INITIAL_PRESETS,
} from '../shared/colors';

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

const PRESET_LABELS: Record<PresetSlot, string> = {
  default: 'Default',
  positive: 'Positive',
  negative: 'Negative',
};
const PRESET_ORDER: PresetSlot[] = ['default', 'positive', 'negative'];

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
      <circle cx={x} cy={y} r={10} fill="transparent" />
      <circle
        cx={x} cy={y} r={r}
        style={{
          fill: active ? '#0d99ff' : 'var(--dot-f)',
          stroke: active ? '#0d99ff' : 'var(--dot-s)',
          strokeWidth: 1.5,
          strokeDasharray: isAuto && !active ? '2.2 1.4' : undefined,
        } as React.CSSProperties}
      />
      {isAuto && !active && (
        <text
          x={x} y={y + 3.5}
          textAnchor="middle"
          fontSize={5.5}
          fontWeight="700"
          style={{ fill: 'var(--dot-s)', pointerEvents: 'none', userSelect: 'none' } as React.CSSProperties}
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

      <rect
        x={srcBox.x} y={srcBox.y} width={srcBox.w} height={srcBox.h}
        rx={5}
        style={{
          fill: srcActive ? 'var(--hi)' : 'var(--node-f)',
          stroke: srcActive ? '#0d99ff' : 'var(--node-s)',
          strokeWidth: 1.5,
        } as React.CSSProperties}
      />
      <rect
        x={tgtBox.x} y={tgtBox.y} width={tgtBox.w} height={tgtBox.h}
        rx={5}
        style={{
          fill: tgtActive ? 'var(--hi)' : 'var(--node-f)',
          stroke: tgtActive ? '#0d99ff' : 'var(--node-s)',
          strokeWidth: 1.5,
        } as React.CSSProperties}
      />

      <line
        x1={srcPt.x} y1={srcPt.y}
        x2={tgtPt.x} y2={tgtPt.y}
        stroke="#0d99ff"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.55}
        markerEnd="url(#ae-arrow)"
      />

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

      <text
        x={srcBox.x + srcBox.w / 2} y={74}
        textAnchor="middle" fontSize={9} fontWeight="600"
        style={{ fill: 'var(--dot-s)', userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}
      >
        Source
      </text>
      <text
        x={tgtBox.x + tgtBox.w / 2} y={74}
        textAnchor="middle" fontSize={9} fontWeight="600"
        style={{ fill: 'var(--dot-s)', userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}
      >
        Target
      </text>
    </svg>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      title={value ? 'Auto-connect on' : 'Auto-connect off'}
      style={css.toggleBtn}
    >
      <span style={css.toggleLabel}>Auto</span>
      <span style={{ ...css.toggleTrack, background: value ? '#0d99ff' : 'var(--tog-off)' }}>
        <span style={{ ...css.toggleThumb, transform: value ? 'translateX(12px)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

function getHint(
  anchorState: 'none' | 'source' | 'both',
  autoConnect: boolean,
  pendingNames: { source: string; target: string } | null,
  selCount: number,
): string {
  if (selCount > 2) return `${selCount} objects selected — deselect down to 2 to connect`;
  if (anchorState === 'none') return 'Select a source object';
  if (anchorState === 'source') return autoConnect
    ? 'Shift-click a target to connect'
    : 'Select a target to connect';
  if (anchorState === 'both' && pendingNames) return 'Ready — click Connect below';
  if (anchorState === 'both') return 'Adjust settings or shift-click next target';
  return 'Select a source object';
}

// ─── Color preset components ──────────────────────────────────────────────

function ColorPresetsCard({
  presets, setPresets,
}: {
  presets: ColorPresets;
  setPresets: (next: ColorPresets) => void;
}) {
  const slot = presets.active;
  const activeHex = presets[slot];
  const [hexInput, setHexInput] = useState(activeHex.replace('#', ''));

  useEffect(() => {
    setHexInput(presets[slot].replace('#', '').padEnd(6, '0').slice(0, 6));
  }, [slot, presets]);

  const setActiveHex = (hex: string) => {
    setPresets({ ...presets, [slot]: hex });
  };

  return (
    <div style={css.card}>
      <Label>Color</Label>

      {/* Segmented selector */}
      <div style={css.segmented}>
        {PRESET_ORDER.map((s) => {
          const active = presets.active === s;
          return (
            <button
              key={s}
              style={{ ...css.seg, ...(active ? css.segActive : {}) }}
              onClick={() => setPresets({ ...presets, active: s })}
            >
              <span style={{
                display: 'inline-block', width: 12, height: 12, borderRadius: 6,
                background: presets[s], border: '1px solid rgba(0,0,0,0.12)',
                flexShrink: 0,
              }} />
              <span style={css.segLabel}>{PRESET_LABELS[s]}</span>
            </button>
          );
        })}
      </div>

      {/* Hex editor for the active preset */}
      <div style={css.colorRow}>
        <div style={css.swatchWrap}>
          <div style={{ ...css.swatch, background: activeHex }} />
          <input
            type="color"
            value={activeHex}
            onChange={(e) => {
              const hex = e.target.value;
              setHexInput(hex.replace('#', ''));
              setActiveHex(hex);
            }}
            style={css.colorNative}
          />
        </div>
        <span style={css.colorHash}>#</span>
        <input
          type="text"
          maxLength={6}
          value={hexInput}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            setHexInput(raw);
            if (raw.length === 6) setActiveHex('#' + raw);
          }}
          onBlur={() => {
            const padded = hexInput.padEnd(6, '0');
            setHexInput(padded);
            setActiveHex('#' + padded);
          }}
          style={css.hexInput}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('connector-dark') === '1'; } catch { return false; }
  });

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    try { localStorage.setItem('connector-dark', dark ? '1' : '0'); } catch {}
  }, [dark]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [anchorState, setAnchorState] = useState<'none' | 'source' | 'both'>('none');
  const [autoConnect, setAutoConnect] = useState(true);
  const [pendingNames, setPendingNames] = useState<{ source: string; target: string } | null>(null);
  const [selCount, setSelCount] = useState(0);

  const [sourceMagnet, setSourceMagnet] = useState<Magnet>('AUTO');
  const [targetMagnet, setTargetMagnet] = useState<Magnet>('AUTO');
  const [startCap, setStartCap] = useState<StrokeCap>('NONE');
  const [endCap, setEndCap] = useState<StrokeCap>('ARROW_LINES');
  const [strokeWeight, setStrokeWeight] = useState(2);
  const [lineType, setLineType] = useState<LineType>('ELBOW');
  const [sourceOffset, setSourceOffset] = useState(0);
  const [targetOffset, setTargetOffset] = useState(0);

  // Color presets state
  const [presets, setPresetsState] = useState<ColorPresets>(INITIAL_PRESETS);

  // Guard flag so the plugin-sent initial presets don't trigger a round-trip.
  const skipNextPresetPost = useRef(false);

  useEffect(() => {
    const s: ConnectSettings = {
      sourceMagnet, targetMagnet, startCap, endCap, strokeWeight, lineType,
      sourceOffset, targetOffset, autoConnect,
    };
    parent.postMessage({ pluginMessage: { type: 'update-settings', settings: s } }, '*');
  }, [sourceMagnet, targetMagnet, startCap, endCap, strokeWeight, lineType, sourceOffset, targetOffset, autoConnect]);

  useEffect(() => {
    if (skipNextPresetPost.current) {
      skipNextPresetPost.current = false;
      return;
    }
    parent.postMessage({ pluginMessage: { type: 'update-presets', presets } }, '*');
  }, [presets]);

  const setPresets = (next: ColorPresets) => {
    setPresetsState(next);
  };

  useEffect(() => {
    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      if (!msg) return;
      if (msg.type === 'state-update') {
        setErrorMsg(null);
        setPendingNames(null);
        setSelCount(msg.count ?? (msg.source ? 1 : 0));
        setAnchorState(msg.source ? 'source' : 'none');
      }
      if (msg.type === 'ready-to-connect') {
        setErrorMsg(null);
        setAnchorState('both');
        setPendingNames({ source: msg.source.name, target: msg.target.name });
      }
      if (msg.type === 'connected') {
        setErrorMsg(null);
        setPendingNames(null);
        setAnchorState('both');
      }
      if (msg.type === 'error') setErrorMsg(msg.message);

      if (msg.type === 'presets-loaded' && msg.presets) {
        skipNextPresetPost.current = true;
        setPresetsState(msg.presets);
      }
    };
  }, []);

  const hint = getHint(anchorState, autoConnect, pendingNames, selCount);
  const liveEdit = anchorState === 'both' && !pendingNames;

  return (
    <div style={css.root}>

      {/* Hint bar — fixed at top, outside scroll area */}
      <div style={css.hintBar}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="6" cy="6" r="5" stroke="var(--tx3)" strokeWidth="1.2"/>
          <path d="M6 5.5v3M6 3.5v.5" stroke="var(--tx3)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <span style={{ flex: 1 }}>{hint}</span>
        <button
          onClick={() => setDark(d => !d)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={css.themeBtn}
        >
          {dark ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="3" stroke="var(--tx2)" strokeWidth="1.3"/>
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="var(--tx2)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11.5 8.5A5 5 0 0 1 5.5 2.5a5 5 0 1 0 6 6z" stroke="var(--tx2)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>

      <div style={css.scrollArea}>

      {/* Line type */}
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

      {/* Connection points */}
      <div style={css.card}>
        <div style={css.cardHeader}>
          <Label>Connection points</Label>
          <Toggle value={autoConnect} onChange={setAutoConnect} />
        </div>
        <AnchorEditor
          sourceMagnet={sourceMagnet}
          targetMagnet={targetMagnet}
          onSourceChange={setSourceMagnet}
          onTargetChange={setTargetMagnet}
          activeState={anchorState}
        />
        {liveEdit && (
          <div style={css.liveEditHint}>
            The last connector is still active — adjust its anchor points and settings above, or shift-click the next target to continue.
          </div>
        )}
      </div>

      {/* Arrowheads */}
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

      {/* Stroke & Offset (color row removed) */}
      <div style={css.card}>
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
      </div>

      {/* Color presets */}
      <ColorPresetsCard presets={presets} setPresets={setPresets} />

      {/* Error */}
      {errorMsg && (
        <div style={css.error}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="6" cy="6" r="5" stroke="#e03" strokeWidth="1.2"/>
            <path d="M6 3.5v3M6 8.5v.5" stroke="#e03" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      </div>{/* end scrollArea */}

      {!autoConnect && (
        <div style={css.footer}>
          {pendingNames ? (
            <button
              style={css.connectBtn}
              onClick={() => parent.postMessage({ pluginMessage: { type: 'connect-now' } }, '*')}
            >
              Connect: <b style={{ marginLeft: 4 }}>{pendingNames.source}</b>
              <span style={{ opacity: 0.5, margin: '0 5px' }}>→</span>
              <b>{pendingNames.target}</b>
            </button>
          ) : (
            <button style={{ ...css.connectBtn, ...css.connectBtnDisabled }} disabled>
              {selCount > 2 ? `Too many objects selected (${selCount})` : 'Select 2 objects to connect'}
            </button>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Styles (colors via CSS variables — see index.html for light/dark defs) ──

// Cast CSS-variable strings past TypeScript's strict color types.
const v = (s: string) => s as unknown as string;

const css: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontSize: 12,
    color: v('var(--tx)'),
    background: v('var(--bg)'),
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    boxSizing: 'border-box' as const,
  },

  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  toggleBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  },
  toggleLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase' as const, color: v('var(--tx3)'),
  },
  toggleTrack: {
    position: 'relative' as const, width: 28, height: 16,
    borderRadius: 8, transition: 'background 0.15s ease',
    flexShrink: 0, overflow: 'hidden' as const,
  },
  toggleThumb: {
    position: 'absolute' as const, top: 2, left: 2, width: 12, height: 12,
    borderRadius: 6, background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
    transition: 'transform 0.15s ease',
  },

  liveEditHint: {
    fontSize: 10, color: v('var(--tx2)'), lineHeight: 1.5, paddingTop: 2,
  },

  footer: {
    flexShrink: 0,
    padding: '8px 10px',
    borderTop: v('1px solid var(--ft-bd)'),
    background: v('var(--bg)'),
    minHeight: 50,
    display: 'flex',
    alignItems: 'center',
  },
  connectBtn: {
    flex: 1, height: 34,
    background: '#0d99ff', color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', whiteSpace: 'nowrap' as const,
    transition: 'background 0.1s ease',
  },
  connectBtnDisabled: {
    background: v('var(--bd)'), color: v('var(--tx2)'), cursor: 'not-allowed',
  },

  hintBar: {
    background: v('var(--sf)'),
    borderBottom: v('1px solid var(--bd)'),
    padding: '9px 12px',
    fontSize: 11,
    color: v('var(--tx2)'),
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  themeBtn: {
    width: 26, height: 26, flexShrink: 0,
    border: v('1px solid var(--bd)'), borderRadius: 6,
    background: v('var(--sf2)'), cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  },

  card: {
    background: v('var(--sf)'),
    borderRadius: 10,
    padding: '11px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    position: 'relative',
  },

  label: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: v('var(--tx2)'),
  },
  colLabel: { fontSize: 10, fontWeight: 600, color: v('var(--tx3)'), marginBottom: 4 },

  segmented: { display: 'flex', gap: 4 },
  seg: {
    flex: 1, padding: '7px 4px 6px',
    border: v('1px solid var(--bd)'), borderRadius: 7,
    background: v('var(--sf2)'), cursor: 'pointer',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4,
    transition: 'all 0.12s ease',
  },
  segActive: { background: v('var(--hi)'), border: v('1px solid var(--hb)') },
  segLabel: { fontSize: 10, fontWeight: 600, color: v('var(--tx4)') },

  twoCol: { display: 'flex', gap: 12 },
  colItem: { display: 'flex', flexDirection: 'column', flex: 1 },

  pillGroup: { display: 'flex', gap: 3 },
  pill: {
    flex: 1, height: 26,
    border: v('1px solid var(--bd)'), borderRadius: 5,
    background: v('var(--sf2)'), cursor: 'pointer',
    fontSize: 12, color: v('var(--tx2)'), padding: 0,
    transition: 'all 0.1s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  pillActive: { background: '#0d99ff', borderColor: '#0d99ff', color: '#fff' },

  sliderRow: { display: 'flex', alignItems: 'center', gap: 8 },
  slider: { flex: 1, accentColor: '#0d99ff', height: 4 },
  strokeNumInput: {
    width: 54, height: 26,
    border: v('1px solid var(--bd)'), borderRadius: 5,
    fontSize: 12, color: v('var(--tx)'), background: v('var(--sf2)'),
    paddingLeft: 7, paddingRight: 2,
    flexShrink: 0, boxSizing: 'border-box' as const,
  },

  stepper: { display: 'flex', alignItems: 'center', gap: 3 },
  stepBtn: {
    width: 26, height: 26,
    border: v('1px solid var(--bd)'), borderRadius: 5,
    background: v('var(--sf2)'), cursor: 'pointer',
    fontSize: 14, color: v('var(--tx4)'), padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepInput: {
    flex: 1, height: 26,
    border: v('1px solid var(--bd)'), borderRadius: 5,
    textAlign: 'center' as const,
    fontSize: 12, color: v('var(--tx)'), background: v('var(--sf2)'),
    padding: '0 2px', width: 0, minWidth: 0,
  },

  divider: { height: 1, background: v('var(--dv)'), margin: '2px 0' },

  colorRow: { display: 'flex', alignItems: 'center', gap: 6 },
  swatchWrap: {
    position: 'relative', width: 26, height: 26, flexShrink: 0,
    borderRadius: 5, overflow: 'hidden',
    border: v('1px solid var(--bd2)'), cursor: 'pointer',
  },
  swatch: { position: 'absolute', inset: 0, borderRadius: 4 },
  colorNative: {
    position: 'absolute', inset: 0,
    opacity: 0, cursor: 'pointer', width: '100%', height: '100%', padding: 0, border: 'none',
  },
  colorHash: { fontSize: 12, color: v('var(--tx3)'), fontWeight: 500, userSelect: 'none' },
  hexInput: {
    flex: 1, height: 26,
    border: v('1px solid var(--bd)'), borderRadius: 5,
    fontSize: 12, fontFamily: "'SF Mono', 'Fira Mono', monospace",
    color: v('var(--tx)'), background: v('var(--sf2)'),
    padding: '0 8px', letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },

  error: {
    display: 'flex', alignItems: 'flex-start', gap: 7,
    padding: '9px 12px',
    background: v('var(--err-bg)'),
    border: v('1px solid var(--err-bd)'),
    borderRadius: 8,
    fontSize: 11,
    color: v('var(--err-tx)'),
    wordBreak: 'break-word' as const,
  },
};
