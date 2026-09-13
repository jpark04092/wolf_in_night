var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_vite = require("vite");

// src/server/webdavMiddleware.ts
var import_path = __toESM(require("path"), 1);
var import_promises = __toESM(require("fs/promises"), 1);
var import_fs = require("fs");
var STORAGE_DIR = import_path.default.resolve(process.cwd(), "webdav_storage");
function resolveWebdavPath(urlPath) {
  const cleanPath = urlPath.split("?")[0];
  const relative = cleanPath.replace(/^\/webdav(\/|$)/, "");
  let decoded = relative;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    decoded = relative;
  }
  const safeRelative = import_path.default.normalize(decoded).replace(/^(\.\.[\/\\])+/, "");
  return import_path.default.join(STORAGE_DIR, safeRelative);
}
async function initStorage() {
  const roomsDir = import_path.default.join(STORAGE_DIR, "rooms");
  if (!(0, import_fs.existsSync)(roomsDir)) {
    await import_promises.default.mkdir(roomsDir, { recursive: true });
  }
  const adminFile = import_path.default.join(STORAGE_DIR, "admin.json");
  if (!(0, import_fs.existsSync)(adminFile)) {
    const defaultAdmin = {
      password: "0000",
      updatedAt: Date.now()
    };
    await import_promises.default.writeFile(adminFile, JSON.stringify(defaultAdmin, null, 2), "utf-8");
  }
}
function getRequestBody(req) {
  if (req.body instanceof Buffer) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body));
  if (req.body && typeof req.body === "object") return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function webdavConnectMiddleware(req, res, next) {
  const url = req.url || "";
  const pathname = url.split("?")[0];
  if (!pathname.startsWith("/webdav") && pathname !== "/api/rooms") {
    if (next) next();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Depth, Destination, Accept, Authorization, Cache-Control, Pragma, X-Requested-With, Overwrite, If, Lock-Token"
  );
  res.setHeader("Access-Control-Expose-Headers", "DAV, Location, Content-Type, Depth");
  res.setHeader("DAV", "1, 2");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (pathname === "/api/rooms") {
    (async () => {
      try {
        await initStorage();
        const roomsDir = import_path.default.join(STORAGE_DIR, "rooms");
        const files = await import_promises.default.readdir(roomsDir, { withFileTypes: true });
        const roomsList = [];
        for (const file of files) {
          if (!file.isDirectory() || file.name.startsWith(".")) continue;
          const roomId = file.name;
          const roomDir = import_path.default.join(roomsDir, roomId);
          let phase = "WAITING";
          let hostId = "";
          const stateFile = import_path.default.join(roomDir, "state.json");
          if ((0, import_fs.existsSync)(stateFile)) {
            try {
              const raw = await import_promises.default.readFile(stateFile, "utf-8");
              const state = JSON.parse(raw);
              phase = state.phase || "WAITING";
              hostId = state.hostId || "";
            } catch {
            }
          }
          let playerCount = 0;
          try {
            const roomFiles = await import_promises.default.readdir(roomDir);
            playerCount = roomFiles.filter(
              (f) => f.startsWith("user_") && f.endsWith(".json")
            ).length;
          } catch {
          }
          roomsList.push({
            id: roomId,
            name: roomId.replace(/^room_/, "\uBC29 "),
            playerCount,
            phase,
            hostId
          });
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(roomsList));
      } catch (err) {
        console.error("API /api/rooms error:", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: String(err) }));
      }
    })();
    return;
  }
  (async () => {
    await initStorage();
    const targetPath = resolveWebdavPath(pathname);
    const method = (req.method || "GET").toUpperCase();
    try {
      if (method === "MKCOL") {
        if ((0, import_fs.existsSync)(targetPath)) {
          res.statusCode = 405;
          res.end("Collection already exists");
          return;
        }
        await import_promises.default.mkdir(targetPath, { recursive: true });
        res.statusCode = 201;
        res.end("Collection created");
        return;
      }
      if (method === "PUT") {
        const parentDir = import_path.default.dirname(targetPath);
        if (!(0, import_fs.existsSync)(parentDir)) {
          await import_promises.default.mkdir(parentDir, { recursive: true });
        }
        const bodyContent = await getRequestBody(req);
        await import_promises.default.writeFile(targetPath, bodyContent);
        res.statusCode = 201;
        res.end("File created/updated");
        return;
      }
      if (method === "GET") {
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const stat = await import_promises.default.stat(targetPath);
        if (stat.isDirectory()) {
          const items = await import_promises.default.readdir(targetPath);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ directory: pathname, items }));
          return;
        }
        const content = await import_promises.default.readFile(targetPath);
        if (targetPath.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        } else {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.end(content);
        return;
      }
      if (method === "MOVE") {
        const destHeader = req.headers["destination"] || "";
        if (!destHeader) {
          res.statusCode = 400;
          res.end("Destination header required");
          return;
        }
        let destUrlPath = destHeader;
        try {
          const parsed = new URL(destHeader, "http://localhost");
          destUrlPath = parsed.pathname;
        } catch {
        }
        const destDiskPath = resolveWebdavPath(destUrlPath);
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.statusCode = 404;
          res.end("Source not found");
          return;
        }
        const destParent = import_path.default.dirname(destDiskPath);
        if (!(0, import_fs.existsSync)(destParent)) {
          await import_promises.default.mkdir(destParent, { recursive: true });
        }
        await import_promises.default.rename(targetPath, destDiskPath);
        res.statusCode = 201;
        res.end("Moved");
        return;
      }
      if (method === "DELETE") {
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        await import_promises.default.rm(targetPath, { recursive: true, force: true });
        res.statusCode = 204;
        res.end();
        return;
      }
      if (method === "PROPFIND") {
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const stat = await import_promises.default.stat(targetPath);
        const depth = req.headers["depth"] || "1";
        const responses = [];
        const selfUrl = pathname.endsWith("/") ? pathname : `${pathname}/`;
        responses.push({
          href: selfUrl,
          name: import_path.default.basename(targetPath) || "",
          isDir: stat.isDirectory(),
          size: stat.size
        });
        if (stat.isDirectory() && depth !== "0") {
          const files = await import_promises.default.readdir(targetPath, { withFileTypes: true });
          for (const file of files) {
            if (file.name.startsWith(".")) continue;
            const filePath = import_path.default.join(targetPath, file.name);
            const fileStat = await import_promises.default.stat(filePath);
            const itemUrl = `${selfUrl}${file.name}${file.isDirectory() ? "/" : ""}`;
            responses.push({
              href: itemUrl,
              name: file.name,
              isDir: file.isDirectory(),
              size: fileStat.size
            });
          }
        }
        const acceptHeader = req.headers["accept"] || "";
        if (acceptHeader.includes("application/json")) {
          res.statusCode = 207;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(responses));
          return;
        }
        let xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
        xml += '<D:multistatus xmlns:D="DAV:">\n';
        for (const item of responses) {
          xml += "  <D:response>\n";
          xml += `    <D:href>${item.href}</D:href>
`;
          xml += "    <D:propstat>\n";
          xml += "      <D:prop>\n";
          xml += `        <D:displayname>${item.name}</D:displayname>
`;
          if (item.isDir) {
            xml += "        <D:resourcetype><D:collection/></D:resourcetype>\n";
          } else {
            xml += "        <D:resourcetype/>\n";
            xml += `        <D:getcontentlength>${item.size}</D:getcontentlength>
`;
          }
          xml += "      </D:prop>\n";
          xml += "      <D:status>HTTP/1.1 200 OK</D:status>\n";
          xml += "    </D:propstat>\n";
          xml += "  </D:response>\n";
        }
        xml += "</D:multistatus>";
        res.statusCode = 207;
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.end(xml);
        return;
      }
      res.statusCode = 405;
      res.end(`Method ${method} not allowed`);
    } catch (err) {
      console.error("WebDAV Error:", err);
      res.statusCode = 500;
      res.end(`WebDAV Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

// server.ts
var PORT = 3e3;
async function startServer() {
  await initStorage();
  const app = (0, import_express.default)();
  app.use("/webdav", import_express.default.raw({ type: "*/*", limit: "10mb" }));
  app.use(webdavConnectMiddleware);
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`One Night Werewolf WebDAV Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
