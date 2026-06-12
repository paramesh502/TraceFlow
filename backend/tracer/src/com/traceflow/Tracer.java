package com.traceflow;

import com.sun.jdi.*;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.StepRequest;

import javax.tools.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TraceFlow execution tracer.
 *
 * Reads Java source on stdin, compiles it with debug symbols, runs it under the
 * Java Debug Interface single-stepping every line, and emits a JSON trace of the
 * full program state (call stack + locals + heap) at each step to stdout.
 *
 * Output shape:
 * {
 *   "ok": true,
 *   "className": "TwoSum",
 *   "steps": [
 *     { "line": 12, "method": "twoSum", "stdout": "...",
 *       "frames": [ { "method","className","line","locals": {name: value} } ],
 *       "heap": { "<id>": <object> } }
 *   ],
 *   "stdout": "full program output",
 *   "truncated": false
 * }
 * On failure: { "ok": false, "error": "...", "stage": "compile|run" }
 */
public class Tracer {

    private static final int MAX_STEPS = 1500;
    private static final long DEADLINE_MS = 12_000;

    private static final List<String> LIBRARY_PREFIXES = List.of(
            "java.", "javax.", "jdk.", "sun.", "com.sun.", "module ");

    public static void main(String[] args) {
        try {
            String source = readStdin();
            if (source.isBlank()) {
                emitError("No source code provided.", "input");
                return;
            }
            run(source);
        } catch (Throwable t) {
            emitError("Tracer failure: " + t, "internal");
        }
    }

    private static void run(String source) throws Exception {
        Prepared prepared = prepareSource(source);

        Path workDir = Files.createTempDirectory("traceflow-trace");
        try {
            Path javaFile = workDir.resolve(prepared.className + ".java");
            Files.writeString(javaFile, prepared.source, StandardCharsets.UTF_8);

            String compileError = compile(javaFile, workDir);
            if (compileError != null) {
                emitError(compileError, "compile");
                return;
            }
            trace(prepared.className, workDir);
        } finally {
            deleteRecursively(workDir);
        }
    }

    // ---- Source preparation ----

    private record Prepared(String className, String source) {}

    private static final Pattern PUBLIC_CLASS =
            Pattern.compile("public\\s+(?:final\\s+|abstract\\s+)?class\\s+(\\w+)");
    private static final Pattern ANY_CLASS =
            Pattern.compile("\\bclass\\s+(\\w+)");

    private static Prepared prepareSource(String source) {
        Matcher pub = PUBLIC_CLASS.matcher(source);
        if (pub.find()) {
            return new Prepared(pub.group(1), source);
        }
        Matcher any = ANY_CLASS.matcher(source);
        if (any.find()) {
            return new Prepared(any.group(1), source);
        }
        // No class at all: wrap the snippet in a Main class with a main method.
        String wrapped = "public class Main {\n"
                + "    public static void main(String[] args) {\n"
                + source + "\n"
                + "    }\n}\n";
        return new Prepared("Main", wrapped);
    }

    // ---- Compilation ----

    private static String compile(Path javaFile, Path outDir) {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            return "No Java compiler available on the server.";
        }
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            Iterable<? extends JavaFileObject> units =
                    fm.getJavaFileObjectsFromFiles(List.of(javaFile.toFile()));
            List<String> options = List.of("-g", "-d", outDir.toString());
            StringWriter err = new StringWriter();
            boolean ok = compiler.getTask(err, fm, diagnostics, options, null, units).call();
            if (ok) return null;

            StringBuilder sb = new StringBuilder("Compilation failed:\n");
            for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
                if (d.getKind() == Diagnostic.Kind.ERROR) {
                    long line = d.getLineNumber();
                    sb.append("  line ").append(line < 0 ? "?" : line)
                      .append(": ").append(d.getMessage(null)).append('\n');
                }
            }
            return sb.toString().trim();
        } catch (IOException e) {
            return "Compilation error: " + e.getMessage();
        }
    }

    // ---- Tracing under JDI ----

    private static void trace(String className, Path classpath) throws Exception {
        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> cargs = connector.defaultArguments();
        cargs.get("main").setValue(className);
        cargs.get("options").setValue("-cp " + quote(classpath.toString()));

        VirtualMachine vm = connector.launch(cargs);

        StringBuilder stdout = new StringBuilder();
        Thread outPump = pump(vm.process().getInputStream(), stdout);
        Thread errPump = pump(vm.process().getErrorStream(), stdout);

        List<Object> steps = new ArrayList<>();
        boolean truncated = false;
        long deadline = System.currentTimeMillis() + DEADLINE_MS;

        EventQueue queue = vm.eventQueue();
        boolean connected = true;
        try {
            loop:
            while (connected) {
                EventSet set = queue.remove(500);
                if (set == null) {
                    if (System.currentTimeMillis() > deadline) {
                        truncated = true;
                        break;
                    }
                    continue;
                }
                for (Event event : set) {
                    if (event instanceof VMStartEvent start) {
                        installStepRequest(vm, start.thread());
                    } else if (event instanceof StepEvent step) {
                        steps.add(snapshot(step, stdout.toString()));
                        if (steps.size() >= MAX_STEPS) {
                            truncated = true;
                            connected = false;
                            break loop;
                        }
                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        connected = false;
                        break loop;
                    }
                }
                if (System.currentTimeMillis() > deadline) {
                    truncated = true;
                    break;
                }
                set.resume();
            }
        } finally {
            try { vm.exit(0); } catch (Exception ignored) {}
            joinQuietly(outPump);
            joinQuietly(errPump);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("className", className);
        result.put("steps", steps);
        result.put("stdout", stdout.toString());
        result.put("truncated", truncated);
        result.put("stepCount", steps.size());
        System.out.println(Json.write(result));
    }

    private static void installStepRequest(VirtualMachine vm, ThreadReference thread) {
        StepRequest req = vm.eventRequestManager()
                .createStepRequest(thread, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
        // Skip the standard library so we only step through user code.
        req.addClassExclusionFilter("java.*");
        req.addClassExclusionFilter("javax.*");
        req.addClassExclusionFilter("jdk.*");
        req.addClassExclusionFilter("sun.*");
        req.addClassExclusionFilter("com.sun.*");
        req.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        req.enable();
    }

    private static Map<String, Object> snapshot(StepEvent step, String stdoutSoFar) throws Exception {
        Serializer ser = new Serializer();
        ThreadReference thread = step.thread();

        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("line", step.location().lineNumber());
        snap.put("method", step.location().method().name());

        List<Object> frames = new ArrayList<>();
        for (StackFrame frame : thread.frames()) {
            String declType = frame.location().declaringType().name();
            if (isLibrary(declType)) continue; // only user frames

            Map<String, Object> fi = new LinkedHashMap<>();
            fi.put("className", simpleName(declType));
            fi.put("method", frame.location().method().name());
            fi.put("line", frame.location().lineNumber());

            Map<String, Object> locals = new LinkedHashMap<>();
            ObjectReference thisObj = frame.thisObject();
            if (thisObj != null) {
                locals.put("this", ser.value(thisObj));
            }
            try {
                for (LocalVariable lv : frame.visibleVariables()) {
                    locals.put(lv.name(), ser.value(frame.getValue(lv)));
                }
            } catch (AbsentInformationException ignored) {
                // Compiled without -g (shouldn't happen here) — no locals.
            }
            fi.put("locals", locals);
            frames.add(fi);
        }

        snap.put("frames", frames);
        snap.put("heap", ser.heapForJson());
        snap.put("stdout", stdoutSoFar);
        return snap;
    }

    // ---- helpers ----

    private static boolean isLibrary(String typeName) {
        for (String p : LIBRARY_PREFIXES) {
            if (typeName.startsWith(p)) return true;
        }
        return false;
    }

    private static String simpleName(String binary) {
        int dot = binary.lastIndexOf('.');
        String s = dot >= 0 ? binary.substring(dot + 1) : binary;
        return s.replace('$', '.');
    }

    private static Thread pump(InputStream in, StringBuilder sink) {
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                int c;
                while ((c = r.read()) != -1) {
                    synchronized (sink) {
                        sink.append((char) c);
                    }
                }
            } catch (IOException ignored) {
            }
        });
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static void joinQuietly(Thread t) {
        try { t.join(500); } catch (InterruptedException ignored) {}
    }

    private static String quote(String s) {
        return s.contains(" ") ? "\"" + s + "\"" : s;
    }

    private static String readStdin() throws IOException {
        return new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void emitError(String message, String stage) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("ok", false);
        err.put("error", message);
        err.put("stage", stage);
        System.out.println(Json.write(err));
    }

    private static void deleteRecursively(Path dir) {
        try {
            if (dir == null || !Files.exists(dir)) return;
            try (var walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                });
            }
        } catch (IOException ignored) {
        }
    }
}
