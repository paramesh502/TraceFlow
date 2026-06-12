/**
 * Frontend mirror of the tracer output (`backend/tracer` + `schemas.py`).
 *
 * A trace is a list of per-line `Step` snapshots. Each step has the call stack
 * (`frames`) with local variables, and a `heap` of objects keyed by id. Values
 * are either inline primitives or references into the heap.
 */

export interface TraceResponse {
  ok: boolean;
  className?: string | null;
  steps: Step[];
  stdout: string;
  truncated: boolean;
  stepCount: number;
  error?: string | null;
  stage?: string | null;
}

export interface Step {
  line: number;
  method: string;
  frames: Frame[];
  heap: Record<string, HeapObject>;
  stdout: string;
}

export interface Frame {
  className: string;
  method: string;
  line: number;
  locals: Record<string, Value>;
}

export type Value = PrimValue | RefValue;

export interface PrimValue {
  kind: "prim";
  type: string; // int, double, boolean, char, String, null, ...
  value: string | number | boolean | null;
}

export interface RefValue {
  kind: "ref";
  id: number;
}

export type HeapObject =
  | ArrayObject
  | MapObject
  | ListObject
  | SetObject
  | PlainObject
  | PrimObject;

export interface ArrayObject {
  kind: "array";
  type: string;
  length: number;
  elements: Value[];
  truncated?: boolean;
}

export interface MapObject {
  kind: "map";
  type: string;
  entries: [Value, Value][];
}

export interface ListObject {
  kind: "list";
  type: string;
  elements: Value[];
}

export interface SetObject {
  kind: "set";
  type: string;
  elements: Value[];
}

export interface PlainObject {
  kind: "object";
  type: string;
  fields: Record<string, Value>;
}

export interface PrimObject {
  kind: "prim";
  type: string;
  value: string | number | boolean | null;
}

export function isRef(v: Value): v is RefValue {
  return v.kind === "ref";
}
