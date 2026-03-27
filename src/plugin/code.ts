/// <reference types="@figma/plugin-typings" />

type Magnet = 'AUTO' | 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
type StrokeCap =
  | 'NONE'
  | 'ARROW_LINES'
  | 'ARROW_EQUILATERAL'
  | 'TRIANGLE_FILLED'
  | 'CIRCLE_FILLED'
  | 'DIAMOND_FILLED';
type LineType = 'ELBOW' | 'STRAIGHT' | 'CURVED';

interface NodeInfo { id: string; name: string }

interface ConnectSettings {
  sourceMagnet: Magnet;
  targetMagnet: Magnet;
  startCap: StrokeCap;
  endCap: StrokeCap;
  strokeWeight: number;
  lineType: LineType;
  sourceOffset: number;
  targetOffset: number;
  color: string;
}

// --- Plugin state ---

// After connecting, we programmatically set selection to [targetNode].
// We only want to suppress that one specific event (selection = exactly [targetNode]).
// A boolean flag is too blunt — if the user shift+clicks before the queued event fires,
// Figma may coalesce [target] and [target, next] into one event, which would get
// incorrectly suppressed. Instead we store the target ID and only suppress when
// selection is EXACTLY that single node.
let suppressSelectionChangeForTargetId: string | null = null;

// Tracks the ID of the last single-selected element.
// When 2 elements are selected, this tells us which was clicked FIRST (= source).
let prevSingleSelectionId: string | null = null;

// Tracks the last created connection so we can live-update it while
// the target node remains selected (settings changed → reroute).
let lastConnection: {
  sourceId: string;
  targetId: string;
  vectorId: string;
} | null = null;

let settings: ConnectSettings = {
  sourceMagnet: 'AUTO',
  targetMagnet: 'AUTO',
  startCap: 'NONE',
  endCap: 'ARROW_LINES',
  strokeWeight: 2,
  lineType: 'ELBOW',
  sourceOffset: 0,
  targetOffset: 0,
  color: '#000000',
};

figma.showUI(__html__, { width: 340, height: 520, title: 'Connector' });

// --- Geometry helpers ---

function getAbsoluteBBox(node: SceneNode) {
  const bbox = node.absoluteBoundingBox;
  if (bbox) return bbox;
  const n = node as { x: number; y: number; width: number; height: number };
  return { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 };
}

function getEffectiveSide(
  magnet: Magnet,
  srcBox: ReturnType<typeof getAbsoluteBBox>,
  tgtBox: ReturnType<typeof getAbsoluteBBox>,
  isSource: boolean
): 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT' {
  if (magnet !== 'AUTO') return magnet as 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
  const dx = (tgtBox.x + tgtBox.width / 2) - (srcBox.x + srcBox.width / 2);
  const dy = (tgtBox.y + tgtBox.height / 2) - (srcBox.y + srcBox.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return isSource ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dx > 0 ? 'LEFT' : 'RIGHT');
  } else {
    return isSource ? (dy > 0 ? 'BOTTOM' : 'TOP') : (dy > 0 ? 'TOP' : 'BOTTOM');
  }
}

function getConnectionPoint(
  bbox: ReturnType<typeof getAbsoluteBBox>,
  side: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  offset: number
): { x: number; y: number } {
  switch (side) {
    case 'LEFT':   return { x: bbox.x - offset,                y: bbox.y + bbox.height / 2 };
    case 'RIGHT':  return { x: bbox.x + bbox.width + offset,    y: bbox.y + bbox.height / 2 };
    case 'TOP':    return { x: bbox.x + bbox.width / 2,         y: bbox.y - offset };
    case 'BOTTOM': return { x: bbox.x + bbox.width / 2,         y: bbox.y + bbox.height + offset };
  }
}

// --- Vector helpers ---

interface Point { x: number; y: number }

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.padEnd(6, '0');
  const n = parseInt(full, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function makeVector(vertices: VectorVertex[], segments: VectorSegment[], strokeWeight: number, color: string): VectorNode {
  const v = figma.createVector();
  v.vectorNetwork = { vertices, segments, regions: [] };
  v.strokeWeight = strokeWeight;
  v.strokes = [{ type: 'SOLID', color: hexToRgb(color), opacity: 1 }];
  v.fills = [];
  return v;
}

function makeVectorFromWaypoints(points: Point[], sw: number, sc: StrokeCap, ec: StrokeCap, color: string): VectorNode {
  const last = points.length - 1;
  const vertices: VectorVertex[] = points.map((p, i) => {
    if (i === 0 && sc !== 'NONE') return { x: p.x, y: p.y, strokeCap: sc };
    if (i === last && ec !== 'NONE') return { x: p.x, y: p.y, strokeCap: ec };
    return { x: p.x, y: p.y };
  });
  const segments: VectorSegment[] = points.slice(0, -1).map((_, i) => ({
    start: i, end: i + 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 },
  }));
  return makeVector(vertices, segments, sw, color);
}

function createStraightConnector(p1: Point, p2: Point, sw: number, sc: StrokeCap, ec: StrokeCap, color: string) {
  return makeVectorFromWaypoints([p1, p2], sw, sc, ec, color);
}

function createElbowConnector(
  p1: Point, p2: Point,
  srcSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  tgtSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  sw: number, sc: StrokeCap, ec: StrokeCap, color: string
) {
  const hSrc = srcSide === 'LEFT' || srcSide === 'RIGHT';
  const hTgt = tgtSide === 'LEFT' || tgtSide === 'RIGHT';
  let waypoints: Point[];
  if (hSrc && hTgt) {
    const midX = (p1.x + p2.x) / 2;
    waypoints = [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
  } else if (!hSrc && !hTgt) {
    const midY = (p1.y + p2.y) / 2;
    waypoints = [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2];
  } else if (hSrc) {
    waypoints = [p1, { x: p2.x, y: p1.y }, p2];
  } else {
    waypoints = [p1, { x: p1.x, y: p2.y }, p2];
  }
  return makeVectorFromWaypoints(waypoints, sw, sc, ec, color);
}

function createCurvedConnector(
  p1: Point, p2: Point,
  srcSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  tgtSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  sw: number, sc: StrokeCap, ec: StrokeCap, color: string
) {
  const tension = Math.min(Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)) * 0.4, 200) + 60;
  let c1 = { ...p1 }, c2 = { ...p2 };
  switch (srcSide) {
    case 'RIGHT':  c1 = { x: p1.x + tension, y: p1.y }; break;
    case 'LEFT':   c1 = { x: p1.x - tension, y: p1.y }; break;
    case 'BOTTOM': c1 = { x: p1.x, y: p1.y + tension }; break;
    case 'TOP':    c1 = { x: p1.x, y: p1.y - tension }; break;
  }
  switch (tgtSide) {
    case 'LEFT':   c2 = { x: p2.x - tension, y: p2.y }; break;
    case 'RIGHT':  c2 = { x: p2.x + tension, y: p2.y }; break;
    case 'TOP':    c2 = { x: p2.x, y: p2.y - tension }; break;
    case 'BOTTOM': c2 = { x: p2.x, y: p2.y + tension }; break;
  }
  const v0: VectorVertex = sc !== 'NONE' ? { x: p1.x, y: p1.y, strokeCap: sc } : { x: p1.x, y: p1.y };
  const v1: VectorVertex = ec !== 'NONE' ? { x: p2.x, y: p2.y, strokeCap: ec } : { x: p2.x, y: p2.y };
  return makeVector([v0, v1], [{
    start: 0, end: 1,
    tangentStart: { x: c1.x - p1.x, y: c1.y - p1.y },
    tangentEnd:   { x: c2.x - p2.x, y: c2.y - p2.y },
  }], sw, color);
}

// --- Core connect ---
// Returns the created VectorNode so callers can track it for live-update.

function doConnect(sourceNode: SceneNode, targetNode: SceneNode, s: ConnectSettings): VectorNode {
  const srcBox = getAbsoluteBBox(sourceNode);
  const tgtBox = getAbsoluteBBox(targetNode);
  const srcSide = getEffectiveSide(s.sourceMagnet, srcBox, tgtBox, true);
  const tgtSide = getEffectiveSide(s.targetMagnet, srcBox, tgtBox, false);
  const p1 = getConnectionPoint(srcBox, srcSide, s.sourceOffset);
  const p2 = getConnectionPoint(tgtBox, tgtSide, s.targetOffset);

  let vector: VectorNode;
  if (s.lineType === 'STRAIGHT') {
    vector = createStraightConnector(p1, p2, s.strokeWeight, s.startCap, s.endCap, s.color);
  } else if (s.lineType === 'CURVED') {
    vector = createCurvedConnector(p1, p2, srcSide, tgtSide, s.strokeWeight, s.startCap, s.endCap, s.color);
  } else {
    vector = createElbowConnector(p1, p2, srcSide, tgtSide, s.strokeWeight, s.startCap, s.endCap, s.color);
  }
  figma.currentPage.appendChild(vector);
  return vector;
}

function nodeInfo(node: SceneNode): NodeInfo {
  return { id: node.id, name: node.name };
}

// --- Live-update helper ---
// Called whenever settings change. If the target of the last connection is still
// the only selected node, replace the connector with a freshly routed one.

function tryReroute() {
  if (!lastConnection) return;

  const sel = figma.currentPage.selection;
  if (sel.length !== 1 || sel[0].id !== lastConnection.targetId) return;

  const targetNode = sel[0];
  const sourceNode = figma.currentPage.findOne(n => n.id === lastConnection!.sourceId) as SceneNode | null;
  if (!sourceNode) { lastConnection = null; return; }

  // Remove old vector (it may have been manually deleted already)
  const oldVector = figma.currentPage.findOne(n => n.id === lastConnection!.vectorId);
  if (oldVector) oldVector.remove();

  try {
    const newVector = doConnect(sourceNode, targetNode, settings);
    lastConnection = {
      sourceId: lastConnection.sourceId,
      targetId: lastConnection.targetId,
      vectorId: newVector.id,
    };
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    lastConnection = null;
  }
}

// --- Direction helper ---
// Given two nodes, determine the correct source→target order based on:
// 1. Which was clicked first (prevSingleSelectionId) — most reliable
// 2. Fallback: spatial heuristic (left→right or top→bottom)
function resolveDirection(
  a: SceneNode,
  b: SceneNode
): { sourceNode: SceneNode; targetNode: SceneNode } {
  // If we know which was selected first, use that as the source
  if (prevSingleSelectionId === a.id) return { sourceNode: a, targetNode: b };
  if (prevSingleSelectionId === b.id) return { sourceNode: b, targetNode: a };

  // Fallback spatial heuristic: left→right preferred, then top→bottom
  const aBox = getAbsoluteBBox(a);
  const bBox = getAbsoluteBBox(b);
  const aCx = aBox.x + aBox.width / 2;
  const bCx = bBox.x + bBox.width / 2;
  const aCy = aBox.y + aBox.height / 2;
  const bCy = bBox.y + bBox.height / 2;

  const dx = Math.abs(bCx - aCx);
  const dy = Math.abs(bCy - aCy);

  if (dx >= dy) {
    // Horizontal dominant → left element is source
    return aCx <= bCx
      ? { sourceNode: a, targetNode: b }
      : { sourceNode: b, targetNode: a };
  } else {
    // Vertical dominant → top element is source
    return aCy <= bCy
      ? { sourceNode: a, targetNode: b }
      : { sourceNode: b, targetNode: a };
  }
}

// --- Selection tracking ---
// The entire state is derived from the CURRENT Figma selection.
//
//  0 selected  →  show empty state
//  1 selected  →  show as source, wait for shift+click of target
//  2 selected  →  resolve direction, auto-connect source→target, keep target selected
//  3+ selected →  ignore

figma.on('selectionchange', () => {
  const sel = figma.currentPage.selection;

  // Suppress only the programmatic single-selection of the target node we just set.
  // If sel is anything other than exactly [targetNode], let it through normally.
  if (suppressSelectionChangeForTargetId) {
    if (sel.length === 1 && sel[0].id === suppressSelectionChangeForTargetId) {
      suppressSelectionChangeForTargetId = null;
      return;
    }
    // Different event (e.g. user already shift+clicked a third node) — clear and continue.
    suppressSelectionChangeForTargetId = null;
  }

  if (sel.length === 0) {
    prevSingleSelectionId = null;
    lastConnection = null;
    figma.ui.postMessage({ type: 'state-update', source: null, target: null });
    return;
  }

  if (sel.length === 1) {
    // If the user selected a different node, we lose the live-update window.
    if (lastConnection && sel[0].id !== lastConnection.targetId) {
      lastConnection = null;
    }
    prevSingleSelectionId = sel[0].id;
    figma.ui.postMessage({ type: 'state-update', source: nodeInfo(sel[0]), target: null });
    return;
  }

  if (sel.length === 2) {
    // New pair selected → any previous live-update context is gone.
    lastConnection = null;

    // Resolve which is source and which is target based on click order
    const { sourceNode, targetNode } = resolveDirection(sel[0], sel[1]);

    try {
      const vector = doConnect(sourceNode, targetNode, settings);

      // Remember this connection for live-update while target stays selected.
      lastConnection = {
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        vectorId: vector.id,
      };

      // After connecting, keep target selected → becomes source for next connection.
      suppressSelectionChangeForTargetId = targetNode.id;
      prevSingleSelectionId = targetNode.id;
      figma.currentPage.selection = [targetNode];
      figma.ui.postMessage({
        type: 'connected',
        source: nodeInfo(sourceNode),
        target: nodeInfo(targetNode),
        newSource: nodeInfo(targetNode),
      });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // 3+ elements — clear UI and live-update context
  prevSingleSelectionId = null;
  lastConnection = null;
  figma.ui.postMessage({ type: 'state-update', source: null, target: null });
});

// Send initial state based on what's currently selected
{
  const sel = figma.currentPage.selection;
  if (sel.length === 1) {
    prevSingleSelectionId = sel[0].id;
    figma.ui.postMessage({ type: 'state-update', source: nodeInfo(sel[0]), target: null });
  } else if (sel.length === 2) {
    figma.ui.postMessage({ type: 'state-update', source: nodeInfo(sel[0]), target: nodeInfo(sel[1]) });
  } else {
    figma.ui.postMessage({ type: 'state-update', source: null, target: null });
  }
}

// --- Message handler ---

figma.ui.onmessage = (msg: {
  type: string;
  settings?: ConnectSettings;
}) => {
  if (msg.type === 'update-settings' && msg.settings) {
    settings = msg.settings;
    // If a connection was just made and its target is still selected,
    // replace the connector live with the updated settings.
    tryReroute();
  }
};
