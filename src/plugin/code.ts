/// <reference types="@figma/plugin-typings" />

import {
  ConnectSettings,
  Magnet,
  StrokeCap,
  LineType,
  ColorPresets,
  PresetSlot,
  INITIAL_PRESETS,
  validatePresets,
  hexToRgb,
} from '../shared/colors';

interface NodeInfo {
  id: string;
  name: string;
}

// ─── Plugin state ─────────────────────────────────────────────────────────

// After connecting, we programmatically set selection to [targetNode].
// We only want to suppress that one specific event (selection = exactly
// [targetNode]). A boolean flag is too blunt — store the id and only suppress
// when the selection is EXACTLY that single node.
let suppressSelectionChangeForTargetId: string | null = null;

// Tracks the id of the last single-selected element. When 2 elements are
// selected, this tells us which was clicked FIRST (= source).
let prevSingleSelectionId: string | null = null;

// Tracks the last created connection so we can live-update it while the
// target node remains selected (settings changed → reroute).
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
  autoConnect: true,
};

// Color presets (per-file, persisted via figma.root.setPluginData).
const PRESETS_KEY = 'connector.presets.v1';
let presets: ColorPresets = (() => {
  try {
    const raw = figma.root.getPluginData(PRESETS_KEY);
    if (!raw) return INITIAL_PRESETS;
    return validatePresets(JSON.parse(raw));
  } catch (err) {
    console.warn('[Connector] Failed to load presets, using defaults:', err);
    return INITIAL_PRESETS;
  }
})();

function savePresets(next: ColorPresets) {
  presets = next;
  try {
    figma.root.setPluginData(PRESETS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[Connector] Failed to save presets:', err);
  }
}

// Stores a resolved source+target pair when autoConnect is OFF.
// Cleared after connect-now or any selection change.
let pendingPair: { sourceNode: SceneNode; targetNode: SceneNode } | null = null;


figma.showUI(__html__, { width: 340, height: 520, title: 'Connector' });

// ─── Geometry helpers ─────────────────────────────────────────────────────

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
  isSource: boolean,
): 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT' {
  if (magnet !== 'AUTO') return magnet as 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
  const dx = tgtBox.x + tgtBox.width / 2 - (srcBox.x + srcBox.width / 2);
  const dy = tgtBox.y + tgtBox.height / 2 - (srcBox.y + srcBox.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return isSource ? (dx > 0 ? 'RIGHT' : 'LEFT') : dx > 0 ? 'LEFT' : 'RIGHT';
  } else {
    return isSource ? (dy > 0 ? 'BOTTOM' : 'TOP') : dy > 0 ? 'TOP' : 'BOTTOM';
  }
}

function getConnectionPoint(
  bbox: ReturnType<typeof getAbsoluteBBox>,
  side: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  offset: number,
): { x: number; y: number } {
  switch (side) {
    case 'LEFT':
      return { x: bbox.x - offset, y: bbox.y + bbox.height / 2 };
    case 'RIGHT':
      return { x: bbox.x + bbox.width + offset, y: bbox.y + bbox.height / 2 };
    case 'TOP':
      return { x: bbox.x + bbox.width / 2, y: bbox.y - offset };
    case 'BOTTOM':
      return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height + offset };
  }
}

// ─── Vector geometry helpers (no color, no strokes) ───────────────────────

interface Point {
  x: number;
  y: number;
}

function makeVector(
  vertices: VectorVertex[],
  segments: VectorSegment[],
  strokeWeight: number,
): VectorNode {
  const v = figma.createVector();
  v.vectorNetwork = { vertices, segments, regions: [] };
  v.strokeWeight = strokeWeight;
  v.fills = [];
  // strokes deliberately left unset — applyColorToVector fills them in.
  return v;
}

function makeVectorFromWaypoints(
  points: Point[],
  sw: number,
  sc: StrokeCap,
  ec: StrokeCap,
): VectorNode {
  const last = points.length - 1;
  const vertices: VectorVertex[] = points.map((p, i) => {
    if (i === 0 && sc !== 'NONE') return { x: p.x, y: p.y, strokeCap: sc };
    if (i === last && ec !== 'NONE') return { x: p.x, y: p.y, strokeCap: ec };
    return { x: p.x, y: p.y };
  });
  const segments: VectorSegment[] = points.slice(0, -1).map((_, i) => ({
    start: i,
    end: i + 1,
    tangentStart: { x: 0, y: 0 },
    tangentEnd: { x: 0, y: 0 },
  }));
  return makeVector(vertices, segments, sw);
}

function createStraightConnector(p1: Point, p2: Point, sw: number, sc: StrokeCap, ec: StrokeCap) {
  return makeVectorFromWaypoints([p1, p2], sw, sc, ec);
}

function createElbowConnector(
  p1: Point,
  p2: Point,
  srcSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  tgtSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  sw: number,
  sc: StrokeCap,
  ec: StrokeCap,
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
  return makeVectorFromWaypoints(waypoints, sw, sc, ec);
}

function createCurvedConnector(
  p1: Point,
  p2: Point,
  srcSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  tgtSide: 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT',
  sw: number,
  sc: StrokeCap,
  ec: StrokeCap,
) {
  const tension = Math.min(Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)) * 0.4, 200) + 60;
  let c1 = { ...p1 };
  let c2 = { ...p2 };
  switch (srcSide) {
    case 'RIGHT':
      c1 = { x: p1.x + tension, y: p1.y };
      break;
    case 'LEFT':
      c1 = { x: p1.x - tension, y: p1.y };
      break;
    case 'BOTTOM':
      c1 = { x: p1.x, y: p1.y + tension };
      break;
    case 'TOP':
      c1 = { x: p1.x, y: p1.y - tension };
      break;
  }
  switch (tgtSide) {
    case 'LEFT':
      c2 = { x: p2.x - tension, y: p2.y };
      break;
    case 'RIGHT':
      c2 = { x: p2.x + tension, y: p2.y };
      break;
    case 'TOP':
      c2 = { x: p2.x, y: p2.y - tension };
      break;
    case 'BOTTOM':
      c2 = { x: p2.x, y: p2.y + tension };
      break;
  }
  const v0: VectorVertex =
    sc !== 'NONE' ? { x: p1.x, y: p1.y, strokeCap: sc } : { x: p1.x, y: p1.y };
  const v1: VectorVertex =
    ec !== 'NONE' ? { x: p2.x, y: p2.y, strokeCap: ec } : { x: p2.x, y: p2.y };
  return makeVector(
    [v0, v1],
    [
      {
        start: 0,
        end: 1,
        tangentStart: { x: c1.x - p1.x, y: c1.y - p1.y },
        tangentEnd: { x: c2.x - p2.x, y: c2.y - p2.y },
      },
    ],
    sw,
  );
}

// ─── Coordinate helpers ───────────────────────────────────────────────────

function canvasToLocal(point: Point, node: SceneNode): Point {
  const [[a, b, tx], [c, d, ty]] = node.absoluteTransform;
  const det = a * d - b * c;
  if (Math.abs(det) < 0.0001) return point;
  return {
    x: (d * (point.x - tx) - b * (point.y - ty)) / det,
    y: (a * (point.y - ty) - c * (point.x - tx)) / det,
  };
}

// ─── Layer hierarchy helpers ──────────────────────────────────────────────

function getAncestorChain(node: SceneNode): BaseNode[] {
  const chain: BaseNode[] = [];
  let current: BaseNode = node;
  while (current.parent) {
    chain.push(current.parent);
    current = current.parent;
  }
  return chain;
}

function lowestCommonAncestor(a: SceneNode, b: SceneNode): BaseNode {
  const chainA = getAncestorChain(a);
  const chainBIds = new Set(getAncestorChain(b).map((n) => n.id));

  for (const ancestor of chainA) {
    if (chainBIds.has(ancestor.id) && ancestor.type !== 'INSTANCE') {
      return ancestor;
    }
  }
  return figma.currentPage;
}

// ─── Color application ───────────────────────────────────────────────────

function applyColor(v: VectorNode, hex: string) {
  v.strokes = [{ type: 'SOLID', color: hexToRgb(hex), opacity: 1 }];
}

// ─── Core connect ─────────────────────────────────────────────────────────

function doConnect(
  sourceNode: SceneNode,
  targetNode: SceneNode,
  s: ConnectSettings,
  hex: string,
): VectorNode {
  const srcBox = getAbsoluteBBox(sourceNode);
  const tgtBox = getAbsoluteBBox(targetNode);
  const srcSide = getEffectiveSide(s.sourceMagnet, srcBox, tgtBox, true);
  const tgtSide = getEffectiveSide(s.targetMagnet, srcBox, tgtBox, false);

  let p1 = getConnectionPoint(srcBox, srcSide, s.sourceOffset);
  let p2 = getConnectionPoint(tgtBox, tgtSide, s.targetOffset);

  const container = lowestCommonAncestor(sourceNode, targetNode);
  if (container.type !== 'PAGE' && container.type !== 'DOCUMENT') {
    const c = container as SceneNode;
    p1 = canvasToLocal(p1, c);
    p2 = canvasToLocal(p2, c);
  }

  let vector: VectorNode;
  if (s.lineType === 'STRAIGHT') {
    vector = createStraightConnector(p1, p2, s.strokeWeight, s.startCap, s.endCap);
  } else if (s.lineType === 'CURVED') {
    vector = createCurvedConnector(p1, p2, srcSide, tgtSide, s.strokeWeight, s.startCap, s.endCap);
  } else {
    vector = createElbowConnector(p1, p2, srcSide, tgtSide, s.strokeWeight, s.startCap, s.endCap);
  }

  (container as ChildrenMixin).appendChild(vector);
  applyColor(vector, hex);
  return vector;
}

function nodeInfo(node: SceneNode): NodeInfo {
  return { id: node.id, name: node.name };
}

// ─── Live-update helper ───────────────────────────────────────────────────

function tryReroute() {
  if (!lastConnection) return;

  const sel = figma.currentPage.selection;
  if (sel.length !== 1 || sel[0].id !== lastConnection.targetId) return;

  const targetNode = sel[0];
  const sourceNode = figma.getNodeById(lastConnection.sourceId) as SceneNode | null;
  if (!sourceNode) { lastConnection = null; return; }

  const oldVector = figma.getNodeById(lastConnection.vectorId);

  try {
    const newVector = doConnect(sourceNode, targetNode, settings, presets[presets.active]);
    if (oldVector) oldVector.remove();
    lastConnection = {
      sourceId: lastConnection.sourceId,
      targetId: lastConnection.targetId,
      vectorId: newVector.id,
    };
  } catch (err) {
    figma.ui.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
    lastConnection = null;
  }
}

// ─── Direction helper ────────────────────────────────────────────────────

function resolveDirection(
  a: SceneNode,
  b: SceneNode,
): { sourceNode: SceneNode; targetNode: SceneNode } {
  if (prevSingleSelectionId === a.id) return { sourceNode: a, targetNode: b };
  if (prevSingleSelectionId === b.id) return { sourceNode: b, targetNode: a };

  const aBox = getAbsoluteBBox(a);
  const bBox = getAbsoluteBBox(b);
  const aCx = aBox.x + aBox.width / 2;
  const bCx = bBox.x + bBox.width / 2;
  const aCy = aBox.y + aBox.height / 2;
  const bCy = bBox.y + bBox.height / 2;
  const dx = Math.abs(bCx - aCx);
  const dy = Math.abs(bCy - aCy);

  if (dx >= dy) {
    return aCx <= bCx ? { sourceNode: a, targetNode: b } : { sourceNode: b, targetNode: a };
  } else {
    return aCy <= bCy ? { sourceNode: a, targetNode: b } : { sourceNode: b, targetNode: a };
  }
}

function clearPending() {
  pendingPair = null;
}

// ─── Selection tracking ──────────────────────────────────────────────────

figma.on('selectionchange', () => {
  const sel = figma.currentPage.selection;

  if (suppressSelectionChangeForTargetId) {
    if (sel.length === 1 && sel[0].id === suppressSelectionChangeForTargetId) {
      suppressSelectionChangeForTargetId = null;
      return;
    }
    suppressSelectionChangeForTargetId = null;
  }

  if (sel.length === 0) {
    clearPending();
    prevSingleSelectionId = null;
    lastConnection = null;
    figma.ui.postMessage({ type: 'state-update', source: null, target: null });
    return;
  }

  if (sel.length === 1) {
    if (lastConnection && sel[0].id !== lastConnection.targetId) {
      lastConnection = null;
    }
    clearPending();
    prevSingleSelectionId = sel[0].id;
    figma.ui.postMessage({ type: 'state-update', source: nodeInfo(sel[0]), target: null });
    return;
  }

  if (sel.length === 2) {
    lastConnection = null;
    clearPending();

    const { sourceNode, targetNode } = resolveDirection(sel[0], sel[1]);

    if (settings.autoConnect) {
      // Auto mode — connect immediately.
      try {
        const vector = doConnect(sourceNode, targetNode, settings, presets[presets.active]);
        lastConnection = {
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          vectorId: vector.id,
        };
        suppressSelectionChangeForTargetId = targetNode.id;
        prevSingleSelectionId = targetNode.id;
        figma.currentPage.selection = [targetNode];
        figma.notify(`Connected: ${sourceNode.name} → ${targetNode.name}`, { timeout: 2000 });
        figma.ui.postMessage({
          type: 'connected',
          source: nodeInfo(sourceNode),
          target: nodeInfo(targetNode),
          newSource: nodeInfo(targetNode),
        });
      } catch (err) {
        figma.ui.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      // Manual mode — store pair, notify UI.
      pendingPair = { sourceNode, targetNode };
      figma.ui.postMessage({
        type: 'ready-to-connect',
        source: nodeInfo(sourceNode),
        target: nodeInfo(targetNode),
      });
    }
    return;
  }

  // 3+ elements
  clearPending();
  prevSingleSelectionId = null;
  lastConnection = null;
  figma.ui.postMessage({
    type: 'state-update',
    source: null,
    target: null,
    count: sel.length,
  });
});


// ─── Initial state push ──────────────────────────────────────────────────

{
  // Presets first — UI can render immediately.
  figma.ui.postMessage({ type: 'presets-loaded', presets });

  const sel = figma.currentPage.selection;
  if (sel.length === 1) {
    prevSingleSelectionId = sel[0].id;
    figma.ui.postMessage({ type: 'state-update', source: nodeInfo(sel[0]), target: null });
  } else if (sel.length === 2) {
    figma.ui.postMessage({
      type: 'state-update',
      source: nodeInfo(sel[0]),
      target: nodeInfo(sel[1]),
    });
  } else {
    figma.ui.postMessage({ type: 'state-update', source: null, target: null });
  }

}

// ─── Message handler ─────────────────────────────────────────────────────

figma.ui.onmessage = (msg: {
  type: string;
  settings?: ConnectSettings;
  presets?: ColorPresets;
}) => {
  if (msg.type === 'update-settings' && msg.settings) {
    settings = msg.settings;
    tryReroute();
    return;
  }

  if (msg.type === 'update-presets' && msg.presets) {
    savePresets(msg.presets);
    tryReroute();
    return;
  }

  if (msg.type === 'connect-now') {
    if (!pendingPair) return;
    const { sourceNode, targetNode } = pendingPair;

    const srcCheck = figma.getNodeById(sourceNode.id);
    const tgtCheck = figma.getNodeById(targetNode.id);
    if (!srcCheck || !tgtCheck) {
      pendingPair = null;
      figma.ui.postMessage({ type: 'error', message: 'One or both nodes were deleted.' });
      return;
    }

    try {
      const vector = doConnect(sourceNode, targetNode, settings, presets[presets.active]);
      lastConnection = {
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        vectorId: vector.id,
      };
      pendingPair = null;
      suppressSelectionChangeForTargetId = targetNode.id;
      prevSingleSelectionId = targetNode.id;
      figma.currentPage.selection = [targetNode];
      figma.notify(`Connected: ${sourceNode.name} → ${targetNode.name}`, { timeout: 2000 });
      figma.ui.postMessage({
        type: 'connected',
        source: nodeInfo(sourceNode),
        target: nodeInfo(targetNode),
        newSource: nodeInfo(targetNode),
      });
    } catch (err) {
      pendingPair = null;
      figma.ui.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
};
