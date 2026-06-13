# Deploying TraceFlow for free

**Frontend → Vercel** (free, no card). **Backend → Hugging Face Spaces, Docker**
(free, no card; runs the JDK tracer). AI stays "coming soon" so no API key or
quota is needed.

Deploy the **backend first** (you need its URL for the frontend), then the
frontend, then point the backend's CORS at the frontend.

> ⚠️ The backend compiles and runs arbitrary user Java (remote code execution by
> design). The tracer caps steps/time, but does not block file/network access,
> and JDK 21+ has no `SecurityManager`. This is fine for a low-traffic demo on an
> isolated, ephemeral Space — **keep no secrets on it**. Harden with OS-level
> sandboxing (nsjail/gVisor) before treating it as a real product.

---

## 1. Backend → Hugging Face Spaces

1. Create a free account at https://huggingface.co (no card).
2. **New → Space**. Choose **Docker** SDK, **Blank** template. Name it e.g.
   `traceflow-backend`. Create it. This makes a git repo.
3. Clone the Space and copy the backend into it:
   ```bash
   git clone https://huggingface.co/spaces/<your-username>/traceflow-backend
   cd traceflow-backend

   # Copy backend source (from your TraceFlow checkout). Skip venv/build/env.
   rsync -a --exclude='.venv' --exclude='tracer/build' --exclude='__pycache__' \
         --exclude='.env' /path/to/TraceFlow/backend/ ./

   # Use the Hugging Face Space README (has the required metadata header).
   cp /path/to/TraceFlow/deploy/hf-space-README.md ./README.md
   ```
   The Space root now has `Dockerfile`, `app/`, `tracer/`, `requirements.txt`,
   and the metadata `README.md`.
4. Commit and push — this triggers the Docker build (≈3–5 min the first time):
   ```bash
   git add -A && git commit -m "TraceFlow backend" && git push
   ```
5. When the Space shows **Running**, your backend URL is:
   `https://<your-username>-traceflow-backend.hf.space`
   Test it: open `https://<...>.hf.space/health` → should return `{"status":"ok"}`.

> Leave CORS for now — you'll set it in step 3 once you have the Vercel URL.

---

## 2. Frontend → Vercel

1. Go to https://vercel.com, sign in with GitHub, **Add New → Project**, import
   `paramesh502/TraceFlow`.
2. Set **Root Directory** to `frontend`.
3. Add an Environment Variable:
   - `NEXT_PUBLIC_API_BASE_URL` = your HF Space URL (`https://<...>.hf.space`)
   - *(Leave `NEXT_PUBLIC_AI_ENABLED` unset — AI shows "coming soon".)*
4. **Deploy**. You'll get a URL like `https://traceflow-xxxx.vercel.app`.

---

## 3. Connect CORS (backend → frontend)

The browser will block calls from your Vercel site until the backend allows it.

1. In the HF Space → **Settings → Variables and secrets → New variable**:
   - Name: `TRACEFLOW_CORS_ORIGINS`
   - Value: your Vercel URL, e.g. `https://traceflow-xxxx.vercel.app`
2. **Restart** the Space (Settings → Factory reboot / Restart).

---

## 4. Verify

Open your Vercel URL, load a sample, click **Run & Trace**. You should see the
execution step through. If the visualization stays empty, open the browser
console — a CORS error means step 3's value doesn't exactly match the Vercel
origin (no trailing slash, correct https).

---

## Turning AI on later (optional, still free)

1. Get a free key: Gemini (https://aistudio.google.com/apikey) or Groq
   (https://console.groq.com/keys).
2. HF Space → Settings → Variables and secrets → add `GEMINI_API_KEY` (or
   `GROQ_API_KEY`) and `TRACEFLOW_LLM_PROVIDER=gemini`.
3. In Vercel, set `NEXT_PUBLIC_AI_ENABLED=true` and redeploy.
   Note: public traffic will consume your free LLM quota.

---

## Updating after the first deploy

- **Frontend:** push to GitHub `main` → Vercel auto-redeploys.
- **Backend:** push to the Space's git repo → it rebuilds. (Or set up the Space
  to track GitHub — optional.)

## Other Docker hosts

The same `backend/Dockerfile` works on Render, Google Cloud Run, Koyeb, Fly.io,
etc. — they inject `$PORT`, which the image honors. Set `TRACEFLOW_CORS_ORIGINS`
there too.
