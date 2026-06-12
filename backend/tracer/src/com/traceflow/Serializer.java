package com.traceflow;

import com.sun.jdi.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Turns JDI {@link Value} mirrors into the JSON-ready model the frontend
 * renders, and builds a per-step heap of objects keyed by their JDI unique id.
 *
 * Value model:
 *   primitive/string -> {"kind":"prim","type":...,"value":...}
 *   reference        -> {"kind":"ref","id":<long>}
 * Heap entries (heap[id]):
 *   array  -> {"kind":"array","type":...,"elements":[value,...]}
 *   map    -> {"kind":"map","type":...,"entries":[[key,value],...]}
 *   list   -> {"kind":"list","type":...,"elements":[value,...]}
 *   set    -> {"kind":"set","type":...,"elements":[value,...]}
 *   object -> {"kind":"object","type":...,"fields":{name:value,...}}
 *
 * Collections are read *structurally* (via their internal fields) rather than by
 * invoking methods on the target VM — method invocation resumes the debuggee
 * thread and invalidates stack frames, which would make stepping fragile. Field
 * names used here (table/elementData/first/next/item/key/value) are stable
 * across modern JDKs.
 */
final class Serializer {

    private static final int MAX_ELEMENTS = 200;     // per array/collection
    private static final int MAX_FIELDS = 40;        // per object
    private static final int MAX_HEAP_OBJECTS = 4000; // per step, safety bound
    private static final int MAX_STRING = 200;

    /** Fresh per step: id -> serialized object map. */
    private final Map<Long, Map<String, Object>> heap = new LinkedHashMap<>();

    Map<Long, Map<String, Object>> heap() {
        return heap;
    }

    /** Heap with long keys converted to strings, ready for JSON emission. */
    Map<String, Object> heapForJson() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<Long, Map<String, Object>> e : heap.entrySet()) {
            out.put(Long.toString(e.getKey()), e.getValue());
        }
        return out;
    }

    /** Serialize a value, registering any referenced objects into the heap. */
    Map<String, Object> value(Value v) {
        if (v == null) return prim("null", null);
        if (v instanceof BooleanValue b) return prim("boolean", b.value());
        if (v instanceof ByteValue b) return prim("byte", (int) b.value());
        if (v instanceof ShortValue s) return prim("short", (int) s.value());
        if (v instanceof IntegerValue i) return prim("int", i.value());
        if (v instanceof LongValue l) return prim("long", l.value());
        if (v instanceof FloatValue f) return prim("float", (double) f.value());
        if (v instanceof DoubleValue d) return prim("double", d.value());
        if (v instanceof CharValue c) return prim("char", String.valueOf(c.value()));
        if (v instanceof StringReference s) return prim("String", cap(s.value()));
        if (v instanceof ArrayReference a) return refTo(a);
        if (v instanceof ObjectReference o) {
            // Unwrap boxed primitives (Integer, Double, ...) so they render
            // inline as their value rather than as wrapper objects.
            if (isBoxed(o.referenceType().name())) {
                return value(getField(o, "value"));
            }
            return refTo(o);
        }
        return prim("?", v.toString());
    }

    private Map<String, Object> refTo(ObjectReference obj) {
        long id = obj.uniqueID();
        if (!heap.containsKey(id) && heap.size() < MAX_HEAP_OBJECTS) {
            ensure(obj, id);
        }
        Map<String, Object> ref = new LinkedHashMap<>();
        ref.put("kind", "ref");
        ref.put("id", id);
        return ref;
    }

    private void ensure(ObjectReference obj, long id) {
        // Insert an empty placeholder first so cyclic structures terminate.
        Map<String, Object> node = new LinkedHashMap<>();
        heap.put(id, node);

        if (obj instanceof ArrayReference arr) {
            fillArray(arr, node);
            return;
        }
        ReferenceType rt = obj.referenceType();
        String name = rt.name();
        String simple = simpleName(name);

        if (isMap(name)) {
            fillMap(obj, node, simple);
        } else if (isList(name)) {
            fillList(obj, node, simple);
        } else if (isSet(name)) {
            fillSet(obj, node, simple);
        } else if (name.equals("java.lang.String")) {
            node.put("kind", "prim");
            node.put("type", "String");
            node.put("value", cap(((StringReference) obj).value()));
        } else {
            fillObject(obj, rt, node, simple);
        }
    }

    private void fillArray(ArrayReference arr, Map<String, Object> node) {
        node.put("kind", "array");
        node.put("type", simpleName(arr.referenceType().name()));
        int len = arr.length();
        node.put("length", len);
        List<Object> els = new ArrayList<>();
        int n = Math.min(len, MAX_ELEMENTS);
        List<Value> values = n > 0 ? arr.getValues(0, n) : List.of();
        for (Value el : values) els.add(value(el));
        node.put("elements", els);
        node.put("truncated", len > n);
    }

    private void fillObject(ObjectReference obj, ReferenceType rt, Map<String, Object> node, String simple) {
        node.put("kind", "object");
        node.put("type", simple);
        Map<String, Object> fields = new LinkedHashMap<>();
        int count = 0;
        for (Field f : rt.allFields()) {
            if (f.isStatic()) continue;
            if (count++ >= MAX_FIELDS) break;
            try {
                fields.put(f.name(), value(obj.getValue(f)));
            } catch (Exception ignored) {
                // Some fields may be inaccessible; skip rather than fail.
            }
        }
        node.put("fields", fields);
    }

    // ---- Structural reads of java.util collections ----

    private void fillMap(ObjectReference obj, Map<String, Object> node, String simple) {
        node.put("kind", "map");
        node.put("type", simple);
        List<Object> entries = new ArrayList<>();
        try {
            ArrayReference table = (ArrayReference) getField(obj, "table");
            if (table != null) {
                outer:
                for (Value bucketV : table.getValues()) {
                    ObjectReference bucket = (ObjectReference) bucketV;
                    while (bucket != null) {
                        if (entries.size() >= MAX_ELEMENTS) break outer;
                        Value k = getField(bucket, "key");
                        Value val = getField(bucket, "value");
                        entries.add(List.of(value(k), value(val)));
                        bucket = (ObjectReference) getField(bucket, "next");
                    }
                }
            }
        } catch (Exception e) {
            node.put("note", "unreadable map internals");
        }
        node.put("entries", entries);
    }

    private void fillSet(ObjectReference obj, Map<String, Object> node, String simple) {
        node.put("kind", "set");
        node.put("type", simple);
        List<Object> els = new ArrayList<>();
        try {
            // HashSet is backed by a HashMap whose keys are the set members.
            ObjectReference backing = (ObjectReference) getField(obj, "map");
            if (backing != null) {
                ArrayReference table = (ArrayReference) getField(backing, "table");
                if (table != null) {
                    outer:
                    for (Value bucketV : table.getValues()) {
                        ObjectReference bucket = (ObjectReference) bucketV;
                        while (bucket != null) {
                            if (els.size() >= MAX_ELEMENTS) break outer;
                            els.add(value(getField(bucket, "key")));
                            bucket = (ObjectReference) getField(bucket, "next");
                        }
                    }
                }
            }
        } catch (Exception e) {
            node.put("note", "unreadable set internals");
        }
        node.put("elements", els);
    }

    private void fillList(ObjectReference obj, Map<String, Object> node, String simple) {
        node.put("kind", "list");
        node.put("type", simple);
        List<Object> els = new ArrayList<>();
        try {
            String name = obj.referenceType().name();
            if (name.equals("java.util.LinkedList")) {
                ObjectReference n = (ObjectReference) getField(obj, "first");
                while (n != null && els.size() < MAX_ELEMENTS) {
                    els.add(value(getField(n, "item")));
                    n = (ObjectReference) getField(n, "next");
                }
            } else {
                // ArrayList, Vector, Stack, PriorityQueue: backing array + size.
                String arrField = name.equals("java.util.PriorityQueue") ? "queue" : "elementData";
                ArrayReference backing = (ArrayReference) getField(obj, arrField);
                Value sizeV = getFieldOpt(obj, "size", "elementCount");
                int size = sizeV instanceof IntegerValue iv ? iv.value()
                        : (backing != null ? backing.length() : 0);
                int n = Math.min(size, MAX_ELEMENTS);
                if (backing != null && n > 0) {
                    for (Value el : backing.getValues(0, Math.min(n, backing.length()))) {
                        els.add(value(el));
                    }
                }
            }
        } catch (Exception e) {
            node.put("note", "unreadable list internals");
        }
        node.put("elements", els);
    }

    // ---- helpers ----

    private static Value getField(ObjectReference obj, String name) {
        Field f = obj.referenceType().fieldByName(name);
        return f == null ? null : obj.getValue(f);
    }

    private static Value getFieldOpt(ObjectReference obj, String... names) {
        for (String n : names) {
            Field f = obj.referenceType().fieldByName(n);
            if (f != null) return obj.getValue(f);
        }
        return null;
    }

    private static Map<String, Object> prim(String type, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kind", "prim");
        m.put("type", type);
        m.put("value", value);
        return m;
    }

    private static String cap(String s) {
        if (s == null) return null;
        return s.length() > MAX_STRING ? s.substring(0, MAX_STRING) + "…" : s;
    }

    private static String simpleName(String binary) {
        int dot = binary.lastIndexOf('.');
        String s = dot >= 0 ? binary.substring(dot + 1) : binary;
        return s.replace('$', '.');
    }

    private static boolean isMap(String name) {
        return name.equals("java.util.HashMap")
                || name.equals("java.util.LinkedHashMap");
    }

    private static boolean isSet(String name) {
        return name.equals("java.util.HashSet")
                || name.equals("java.util.LinkedHashSet");
    }

    private static boolean isBoxed(String name) {
        return switch (name) {
            case "java.lang.Integer", "java.lang.Long", "java.lang.Short",
                 "java.lang.Byte", "java.lang.Double", "java.lang.Float",
                 "java.lang.Boolean", "java.lang.Character" -> true;
            default -> false;
        };
    }

    private static boolean isList(String name) {
        return name.equals("java.util.ArrayList")
                || name.equals("java.util.LinkedList")
                || name.equals("java.util.Vector")
                || name.equals("java.util.Stack")
                || name.equals("java.util.PriorityQueue");
    }
}
