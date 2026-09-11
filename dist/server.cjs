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
var import_path = __toESM(require("path"), 1);
var import_promises = __toESM(require("fs/promises"), 1);
var import_fs = require("fs");
var import_vite = require("vite");
var PORT = 3e3;
var STORAGE_DIR = import_path.default.resolve(process.cwd(), "webdav_storage");
function resolveWebdavPath(urlPath) {
  const cleanPath = urlPath.split("?")[0];
  const relative = cleanPath.replace(/^\/webdav(\/|$)/, "");
  const safeRelative = import_path.default.normalize(relative).replace(/^(\.\.[\/\\])+/, "");
  return import_path.default.join(STORAGE_DIR, safeRelative);
}
async function initStorage() {
  const roomsDir = import_path.default.join(STORAGE_DIR, "rooms");
  if (!(0, import_fs.existsSync)(roomsDir)) {
    await import_promises.default.mkdir(roomsDir, { recursive: true });
  }
}
async function startServer() {
  await initStorage();
  const app = (0, import_express.default)();
  app.use("/webdav", import_express.default.raw({ type: "*/*", limit: "10mb" }));
  app.use("/webdav", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Depth, Destination");
    res.header("Access-Control-Expose-Headers", "DAV, Location");
    res.header("DAV", "1, 2");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.all("/webdav/*", async (req, res) => {
    const targetPath = resolveWebdavPath(req.path);
    const method = req.method.toUpperCase();
    try {
      if (method === "MKCOL") {
        if ((0, import_fs.existsSync)(targetPath)) {
          res.status(405).send("Collection already exists");
          return;
        }
        await import_promises.default.mkdir(targetPath, { recursive: true });
        res.status(201).send("Collection created");
        return;
      }
      if (method === "PUT") {
        const parentDir = import_path.default.dirname(targetPath);
        if (!(0, import_fs.existsSync)(parentDir)) {
          await import_promises.default.mkdir(parentDir, { recursive: true });
        }
        const bodyContent = req.body instanceof Buffer ? req.body : Buffer.from(req.body || "");
        await import_promises.default.writeFile(targetPath, bodyContent);
        res.status(201).send("File created/updated");
        return;
      }
      if (method === "GET") {
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.status(404).send("Not found");
          return;
        }
        const stat = await import_promises.default.stat(targetPath);
        if (stat.isDirectory()) {
          const items = await import_promises.default.readdir(targetPath);
          res.json({ directory: req.path, items });
          return;
        }
        const content = await import_promises.default.readFile(targetPath);
        if (targetPath.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        } else {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.send(content);
        return;
      }
      if (method === "MOVE") {
        const destHeader = req.headers["destination"];
        if (!destHeader) {
          res.status(400).send("Destination header required");
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
          res.status(404).send("Source not found");
          return;
        }
        const destParent = import_path.default.dirname(destDiskPath);
        if (!(0, import_fs.existsSync)(destParent)) {
          await import_promises.default.mkdir(destParent, { recursive: true });
        }
        await import_promises.default.rename(targetPath, destDiskPath);
        res.status(201).send("Moved");
        return;
      }
      if (method === "DELETE") {
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.status(404).send("Not found");
          return;
        }
        await import_promises.default.rm(targetPath, { recursive: true, force: true });
        res.status(204).end();
        return;
      }
      if (method === "PROPFIND") {
        if (!(0, import_fs.existsSync)(targetPath)) {
          res.status(404).send("Not found");
          return;
        }
        const stat = await import_promises.default.stat(targetPath);
        const depth = req.headers["depth"] || "1";
        const responses = [];
        const selfUrl = req.path.endsWith("/") ? req.path : `${req.path}/`;
        responses.push({
          href: selfUrl,
          name: import_path.default.basename(targetPath) || "",
          isDir: stat.isDirectory(),
          size: stat.size
        });
        if (stat.isDirectory() && depth !== "0") {
          const files = await import_promises.default.readdir(targetPath, { withFileTypes: true });
          for (const file of files) {
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
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.status(207).json(responses);
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
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.status(207).send(xml);
        return;
      }
      res.status(405).send(`Method ${method} not allowed`);
    } catch (err) {
      console.error("WebDAV Error:", err);
      res.status(500).send(`WebDAV Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`One Night Werewolf WebDAV Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
