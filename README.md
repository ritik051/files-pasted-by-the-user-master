# Tracecraft

An interactive code-teaching workspace where the editor, a trace-driven 3D scene, inspector, timeline, and spoken lesson all share one recorded execution.

## Run locally

1. Install Node 22+ and start Docker Desktop.
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:5173`.

The first execution pulls the appropriate official runner image (`node:22-alpine`, `python:3.12-alpine`, `eclipse-temurin:21-jdk-alpine`, or `gcc:14.2`) if it is not already present. Submitted programs run only in ephemeral Docker containers with no network, no host mounts, read-only root filesystems, CPU/memory/process limits, and a timeout.

## Current supported execution subset

- JavaScript: ordinary script programs, declarations, assignments, branches, loops, functions, arrays, objects, and `console.log`. The adapter instruments statement boundaries, assignments, calls, returns, conditions, collection mutations, output, and errors.
- Python: ordinary script programs using the CPython trace hook. It records observable frame locals and line/call/return/exception events.
- Java: sources defining a `Main` class compile and run with stdin. The adapter records process start, output, finish, compiler errors, and runtime termination; it does not claim local-variable or line events until a JVM debugger adapter is added.
- C++: a single C++20 source file compiles and runs with stdin. The adapter records process start, output, finish, compiler errors, and runtime termination; it does not claim local-variable or line events until a debugger adapter is added.

The product rejects source whose trace cannot be produced safely and never substitutes an invented trace.

## Verify

`npm run lint` checks TypeScript. `npm test` runs trace and state-reconstruction tests.

## Public deployment and Google indexing

The included `Dockerfile` and `railway.json` deploy the web application and API to Railway. Connect the repository to a Railway service, deploy using the Dockerfile, and set a public domain. The service exposes `/api/health` for its health check, plus `robots.txt` and a host-aware `sitemap.xml` for crawlers.

For Google Search, add the final public domain to [Google Search Console](https://search.google.com/search-console/about), verify ownership, and submit `https://YOUR_DOMAIN/sitemap.xml`. Discovery and indexing are controlled by Google and are not immediate.

The public web service does not receive a Docker socket from normal app hosts. To execute submitted code in production, connect the API to a separate hardened execution-worker platform before exposing execution to untrusted users. Until then, the deployment keeps the learning workspace public but reports execution-sandbox availability honestly.
