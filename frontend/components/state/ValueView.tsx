"use client";

import { motion } from "framer-motion";
import type {
  ArrayObject,
  HeapObject,
  ListObject,
  MapObject,
  PlainObject,
  SetObject,
  Value,
} from "@/lib/types";

const MAX_DEPTH = 9;
const VALUE_FIELDS = ["val", "value", "data", "key", "item"];

export interface RenderCtx {
  heap: Record<string, HeapObject>;
  seen: Set<number>; // ids currently on the render path (cycle guard)
  depth: number;
}

export function makeCtx(heap: Record<string, HeapObject>): RenderCtx {
  return { heap, seen: new Set(), depth: 0 };
}

/** Render any value: primitives inline, references resolved through the heap. */
export function ValueView({ value, ctx }: { value: Value; ctx: RenderCtx }) {
  if (value.kind === "prim") return <Prim type={value.type} value={value.value} />;

  const obj = ctx.heap[String(value.id)];
  if (!obj) return <RefChip id={value.id} />;
  if (ctx.seen.has(value.id) || ctx.depth > MAX_DEPTH) {
    return <RefChip id={value.id} cyclic />;
  }
  const child: RenderCtx = {
    heap: ctx.heap,
    seen: new Set(ctx.seen).add(value.id),
    depth: ctx.depth + 1,
  };
  return <HeapObjectView obj={obj} ctx={child} />;
}

function HeapObjectView({ obj, ctx }: { obj: HeapObject; ctx: RenderCtx }) {
  switch (obj.kind) {
    case "prim":
      return <Prim type={obj.type} value={obj.value} />;
    case "array":
      return <ArrayView obj={obj} ctx={ctx} />;
    case "map":
      return <MapView obj={obj} ctx={ctx} />;
    case "list":
      return <ListView obj={obj} ctx={ctx} />;
    case "set":
      return <SetView obj={obj} ctx={ctx} />;
    case "object":
      return <ObjectView obj={obj} ctx={ctx} />;
  }
}

// ---- Primitives ----

function Prim({ type, value }: { type: string; value: unknown }) {
  if (type === "null" || value === null) {
    return <span className="rounded bg-surface px-2 py-0.5 text-xs italic text-slate-500">null</span>;
  }
  if (type === "boolean") {
    return (
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${value ? "bg-visited/20 text-visited" : "bg-active/20 text-active"}`}>
        {String(value)}
      </span>
    );
  }
  if (type === "String") {
    return <span className="rounded bg-surface px-2 py-0.5 text-xs text-emerald-300">&quot;{String(value)}&quot;</span>;
  }
  if (type === "char") {
    return <span className="rounded bg-surface px-2 py-0.5 text-xs text-emerald-300">&apos;{String(value)}&apos;</span>;
  }
  return (
    <motion.span
      key={String(value)}
      initial={{ backgroundColor: "rgba(99,102,241,0.35)" }}
      animate={{ backgroundColor: "rgba(99,102,241,0.12)" }}
      transition={{ duration: 0.5 }}
      className="inline-block min-w-[1.75rem] rounded px-2 py-0.5 text-center text-xs font-semibold text-indigo-200"
    >
      {String(value)}
    </motion.span>
  );
}

function RefChip({ id, cyclic }: { id: number; cyclic?: boolean }) {
  return (
    <span className="rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-slate-500">
      {cyclic ? "↻ " : "→ "}#{id}
    </span>
  );
}

function TypeTag({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wide text-slate-500">{children}</span>;
}

// ---- Arrays (1D and 2D) ----

function ArrayView({ obj, ctx }: { obj: ArrayObject; ctx: RenderCtx }) {
  const is2D = obj.elements.some(
    (e) => e.kind === "ref" && ctx.heap[String(e.id)]?.kind === "array",
  );
  if (is2D) {
    return (
      <div className="flex flex-col gap-1">
        {obj.elements.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-5 text-right text-[10px] text-slate-600">{i}</span>
            <ValueView value={row} ctx={ctx} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-1.5">
      {obj.elements.map((el, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border border-surface-border bg-surface-raised px-1">
            <ValueView value={el} ctx={ctx} />
          </div>
          <span className="text-[10px] text-slate-600">{i}</span>
        </div>
      ))}
      {obj.truncated && <span className="self-center text-xs text-slate-500">…</span>}
      {obj.elements.length === 0 && <span className="text-xs text-slate-500">empty</span>}
    </div>
  );
}

// ---- Map ----

function MapView({ obj, ctx }: { obj: MapObject; ctx: RenderCtx }) {
  return (
    <div className="inline-flex flex-col gap-1 rounded-lg border border-surface-border p-1.5">
      <TypeTag>{obj.type}</TypeTag>
      {obj.entries.length === 0 && <span className="text-xs text-slate-500">empty</span>}
      {obj.entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="rounded-md bg-accent-soft/60 px-2 py-0.5">
            <ValueView value={k} ctx={ctx} />
          </div>
          <span className="text-slate-500">→</span>
          <div className="rounded-md border border-surface-border px-2 py-0.5">
            <ValueView value={v} ctx={ctx} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- List / Set ----

function ChipRow({ type, elements, ctx }: { type: string; elements: Value[]; ctx: RenderCtx }) {
  return (
    <div className="inline-flex flex-col gap-1">
      <TypeTag>{type}</TypeTag>
      <div className="flex flex-wrap items-center gap-1.5">
        {elements.length === 0 && <span className="text-xs text-slate-500">empty</span>}
        {elements.map((el, i) => (
          <div key={i} className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border border-surface-border bg-surface-raised px-1">
            <ValueView value={el} ctx={ctx} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({ obj, ctx }: { obj: ListObject; ctx: RenderCtx }) {
  return <ChipRow type={obj.type} elements={obj.elements} ctx={ctx} />;
}

function SetView({ obj, ctx }: { obj: SetObject; ctx: RenderCtx }) {
  return <ChipRow type={obj.type} elements={obj.elements} ctx={ctx} />;
}

// ---- Objects: detect linked lists & trees, else field table ----

function fieldValueLabel(obj: PlainObject): string | null {
  for (const name of VALUE_FIELDS) {
    const v = obj.fields[name];
    if (v && v.kind === "prim") return String(v.value);
  }
  return null;
}

function ObjectView({ obj, ctx }: { obj: PlainObject; ctx: RenderCtx }) {
  const hasLeftRight = "left" in obj.fields || "right" in obj.fields;
  const hasNext = "next" in obj.fields;

  if (hasLeftRight) return <TreeView rootObj={obj} ctx={ctx} />;
  if (hasNext && fieldValueLabel(obj) !== null) return <LinkedListView headObj={obj} ctx={ctx} />;

  return (
    <div className="inline-flex flex-col gap-1 rounded-lg border border-surface-border p-1.5">
      <TypeTag>{obj.type}</TypeTag>
      {Object.entries(obj.fields).map(([name, v]) => (
        <div key={name} className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{name}:</span>
          <ValueView value={v} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

// ---- Linked list: walk `next` and render a chain ----

function LinkedListView({ headObj, ctx }: { headObj: PlainObject; ctx: RenderCtx }) {
  const nodes: { label: string; id: number | null }[] = [];
  const visited = new Set<number>();
  let cur: PlainObject | null = headObj;
  let endedNull = true;

  while (cur) {
    const label = fieldValueLabel(cur) ?? "·";
    nodes.push({ label, id: null });
    const next: Value | undefined = cur.fields["next"];
    if (!next || next.kind === "prim") {
      cur = null;
      break;
    }
    if (visited.has(next.id)) {
      nodes.push({ label: "↻", id: next.id });
      endedNull = false;
      cur = null;
      break;
    }
    visited.add(next.id);
    const obj: HeapObject | undefined = ctx.heap[String(next.id)];
    cur = obj && obj.kind === "object" ? obj : null;
    if (!cur) endedNull = false;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {nodes.map((n, i) => (
        <div key={i} className="flex items-center">
          <motion.div
            layout
            className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border border-accent/50 bg-surface-raised px-2 text-xs font-semibold text-indigo-200"
          >
            {n.label}
          </motion.div>
          {i < nodes.length - 1 ? (
            <span className="px-1 text-slate-500">→</span>
          ) : (
            endedNull && <span className="pl-1 text-[11px] text-slate-500">→ null</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Binary tree: walk left/right and lay out in SVG ----

interface TPos {
  id: number;
  label: string;
  x: number;
  depth: number;
}

function TreeView({ rootObj, ctx }: { rootObj: PlainObject; ctx: RenderCtx }) {
  const positioned: TPos[] = [];
  const edges: [number, number][] = [];
  const idOf = new Map<PlainObject, number>();
  let counter = 0;
  let slot = 0;
  let maxDepth = 0;

  const childObj = (v: Value | undefined): { obj: PlainObject; id: number } | null => {
    if (!v || v.kind !== "ref") return null;
    const o = ctx.heap[String(v.id)];
    return o && o.kind === "object" ? { obj: o, id: v.id } : null;
  };

  const walk = (obj: PlainObject, realId: number, depth: number, visited: Set<number>) => {
    if (visited.has(realId) || depth > 7) return;
    visited.add(realId);
    const myId = counter++;
    idOf.set(obj, myId);
    const left = childObj(obj.fields["left"]);
    if (left) walk(left.obj, left.id, depth + 1, visited);
    positioned.push({ id: myId, label: fieldValueLabel(obj) ?? "·", x: slot++, depth });
    maxDepth = Math.max(maxDepth, depth);
    if (left && idOf.has(left.obj)) edges.push([myId, idOf.get(left.obj)!]);
    const right = childObj(obj.fields["right"]);
    if (right) {
      walk(right.obj, right.id, depth + 1, visited);
      if (idOf.has(right.obj)) edges.push([myId, idOf.get(right.obj)!]);
    }
  };

  // Use the heap id of the root for cycle bookkeeping (fall back to 0).
  walk(rootObj, -1, 0, new Set());

  const count = Math.max(slot, 1);
  const W = Math.max(count * 56, 120);
  const H = (maxDepth + 1) * 70 + 20;
  const colW = W / (count + 1);
  const rowH = maxDepth > 0 ? (H - 40) / maxDepth : 0;
  const pos = new Map(positioned.map((p) => [p.id, p]));
  const px = (p: TPos) => colW * (p.x + 1);
  const py = (p: TPos) => 24 + p.depth * rowH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="max-h-[320px] w-full max-w-[520px]">
      {edges.map(([a, b], i) => {
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        return <line key={i} x1={px(pa)} y1={py(pa)} x2={px(pb)} y2={py(pb)} stroke="#1f2937" strokeWidth="2" />;
      })}
      {positioned.map((p) => (
        <g key={p.id}>
          <circle cx={px(p)} cy={py(p)} r="16" fill="#121826" stroke="#6366f1" strokeWidth="2" />
          <text x={px(p)} y={py(p) + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#c7d2fe">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
