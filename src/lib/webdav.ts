/**
 * WebDAV Client conforming to One Night Ultimate Werewolf Architecture Spec.
 *
 * Implements:
 * - PROPFIND (Depth: 1) with WebDAV Multi-Status XML (or JSON fallback)
 * - MKCOL (Directory creation)
 * - PUT (File creation and update)
 * - GET (Reading files)
 * - MOVE (Atomic renaming with Destination header)
 * - DELETE (Removal)
 */

export interface WebDAVResource {
  href: string;
  name: string;
  isDir: boolean;
  size?: number;
  playerCount?: number;
  phase?: string;
  hostId?: string;
}

// Multi-tab synchronized virtual WebDAV fallback cache to guarantee 100% resilience
const VFS_STORAGE_KEY = 'onw_virtual_fs_v2';
const virtualFS = new Map<string, { content: string; isDir: boolean }>();

// Initialize VFS from localStorage if available
export function syncVFSFromLocalStorage() {
  try {
    const savedVFS = localStorage.getItem(VFS_STORAGE_KEY);
    if (savedVFS) {
      const parsed = JSON.parse(savedVFS);
      virtualFS.clear();
      for (const [k, v] of Object.entries(parsed)) {
        virtualFS.set(k, v as { content: string; isDir: boolean });
      }
    }
  } catch {
    // ignore storage error
  }
}
syncVFSFromLocalStorage();

// Cross-tab synchronization via standard Storage Event and BroadcastChannel
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === VFS_STORAGE_KEY) {
      syncVFSFromLocalStorage();
    }
  });
}

// BroadcastChannel to synchronize virtualFS across all browser tabs in real-time
let vfsChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    vfsChannel = new BroadcastChannel('onw_virtual_fs_sync');
    vfsChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'VFS_UPDATE') {
        const { key, val, isDelete } = event.data;
        if (isDelete) {
          virtualFS.delete(key);
        } else if (val) {
          virtualFS.set(key, val);
        }
      }
    };
  }
} catch {
  // BroadcastChannel not available in environment
}

function persistVFS(key: string, val?: { content: string; isDir: boolean }, isDelete = false) {
  if (isDelete) {
    virtualFS.delete(key);
  } else if (val) {
    virtualFS.set(key, val);
  }

  try {
    const obj: Record<string, { content: string; isDir: boolean }> = {};
    for (const [k, v] of virtualFS.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // quota exceeded or restricted
  }

  if (vfsChannel) {
    try {
      vfsChannel.postMessage({ type: 'VFS_UPDATE', key, val, isDelete });
    } catch {
      // ignore
    }
  }
}

export function normalizePath(path: string): string {
  let p = path.trim();
  if (!p.startsWith('/')) p = '/' + p;
  // ensure /webdav prefix
  if (!p.startsWith('/webdav')) {
    p = '/webdav' + p;
  }
  return p;
}

export class WebDAVClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  // Make an HTTP request to WebDAV endpoint
  private async request(
    method: string,
    path: string,
    body?: string | null,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${normalizePath(path)}`;
    const reqHeaders: Record<string, string> = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      ...headers,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body ?? undefined,
        cache: 'no-store',
        credentials: 'same-origin',
      });

      // If the server returns HTML SPA fallback or 501 on WebDAV paths,
      // it indicates WebDAV is not supported by the current server. Fall back to virtual FS.
      const contentType = res.headers.get('content-type') || '';
      const isHtmlSpaResponse = contentType.includes('text/html') && (method !== 'GET' || !path.endsWith('.html'));
      const isUnsupportedWebDav = !res.ok && (isHtmlSpaResponse || res.status === 501 || (res.status === 405 && method !== 'MKCOL'));

      if (isUnsupportedWebDav) {
        console.warn(`[WebDAV] Server returned status ${res.status} (${contentType}) on ${method} ${url}. Falling back to virtual WebDAV.`);
        return this.handleVirtualFallback(method, path, body, reqHeaders);
      }

      return res;
    } catch (err) {
      console.warn(`[WebDAV] Network/fetch issue on ${method} ${url}, using synchronized fallback:`, err);
      // Fallback to synchronized virtual FS emulator on fetch failure
      return this.handleVirtualFallback(method, path, body, reqHeaders);
    }
  }

  /**
   * Fast rooms query with fallback to PROPFIND.
   * Fully compatible with both Express custom server and standard Apache/Nginx WebDAV.
   */
  async listRooms(): Promise<WebDAVResource[]> {
    // 1. Try custom high-speed JSON API first (if available)
    try {
      const res = await fetch(`${this.baseUrl}/api/rooms`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Accept: 'application/json',
        },
      });

      const contentType = res.headers.get('content-type') || '';
      // Ensure the response is valid JSON, not an HTML SPA fallback (Apache returns index.html on missing endpoints)
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((r: { id: string; name?: string; playerCount?: number; phase?: string; hostId?: string }) => ({
            href: `/webdav/rooms/${encodeURIComponent(r.id)}/`,
            name: r.id,
            isDir: true,
            playerCount: r.playerCount ?? 0,
            phase: r.phase || 'WAITING',
            hostId: r.hostId || '',
          }));
        }
      }
    } catch (e) {
      // JSON endpoint not available or returned non-JSON, gracefully fall back
    }

    // 2. Standard WebDAV PROPFIND /rooms/ (with trailing slash for RFC 4918 compatibility)
    try {
      const resources = await this.propfind('/rooms/', '1');
      const validRoomDirs = resources.filter(
        (r) => r.isDir && r.name && r.name !== 'rooms' && !r.name.startsWith('.')
      );

      // Inspect state.json and user files for each room to extract details
      const detailedRooms = await Promise.all(
        validRoomDirs.map(async (r) => {
          let phase = 'WAITING';
          let hostId = '';
          let playerCount = 0;

          try {
            const state = await this.get<{ phase: string; hostId: string }>(
              `/rooms/${encodeURIComponent(r.name)}/state.json`
            );
            if (state) {
              phase = state.phase || 'WAITING';
              hostId = state.hostId || '';
            }
          } catch {
            // ignore
          }

          try {
            const roomFiles = await this.propfind(`/rooms/${encodeURIComponent(r.name)}/`, '1');
            playerCount = roomFiles.filter(
              (f) => !f.isDir && f.name.startsWith('user_') && f.name.endsWith('.json')
            ).length;
          } catch {
            // ignore
          }

          return {
            href: r.href,
            name: r.name,
            isDir: true,
            playerCount,
            phase,
            hostId,
          };
        })
      );

      // If PROPFIND succeeded, return detailedRooms (even if 0 rooms, as the server responded authoritatively)
      if (resources.length > 0) {
        return detailedRooms;
      }
    } catch (e) {
      console.warn('[WebDAV] PROPFIND fallback error:', e);
    }

    // 3. Inspect VirtualFS entries if in offline/isolated fallback mode
    syncVFSFromLocalStorage();
    const vfsRooms: WebDAVResource[] = [];
    const roomsPrefix = '/webdav/rooms/';
    for (const [key, val] of virtualFS.entries()) {
      if (val.isDir && key.startsWith(roomsPrefix) && key !== roomsPrefix) {
        const sub = key.slice(roomsPrefix.length).replace(/\/$/, '');
        const segs = sub.split('/');
        if (segs.length === 1 && segs[0] && !segs[0].startsWith('.')) {
          const roomId = segs[0];
          // Get state and players from virtualFS
          const stateItem = virtualFS.get(`/webdav/rooms/${roomId}/state.json`);
          let phase = 'WAITING';
          let hostId = '';
          if (stateItem) {
            try {
              const state = JSON.parse(stateItem.content);
              phase = state.phase || 'WAITING';
              hostId = state.hostId || '';
            } catch {
              // ignore
            }
          }
          let playerCount = 0;
          for (const [fKey] of virtualFS.entries()) {
            if (fKey.startsWith(`/webdav/rooms/${roomId}/user_`) && fKey.endsWith('.json')) {
              playerCount++;
            }
          }
          vfsRooms.push({
            href: `/webdav/rooms/${roomId}/`,
            name: roomId,
            isDir: true,
            playerCount,
            phase,
            hostId,
          });
        }
      }
    }

    return vfsRooms;
  }

  // Synchronized multi-tab Virtual fallback for seamless standalone/offline resilience
  private handleVirtualFallback(
    method: string,
    rawPath: string,
    body?: string | null,
    headers: Record<string, string> = {}
  ): Response {
    syncVFSFromLocalStorage();
    const norm = normalizePath(rawPath);

    if (method === 'MKCOL') {
      const dirKey = norm.endsWith('/') ? norm : `${norm}/`;
      persistVFS(dirKey, { content: '', isDir: true });
      return new Response('Created in Virtual FS', { status: 201 });
    }

    if (method === 'PUT') {
      persistVFS(norm, { content: body || '', isDir: false });
      return new Response('Stored in Virtual FS', { status: 201 });
    }

    if (method === 'GET') {
      const item = virtualFS.get(norm);
      if (!item) {
        return new Response('Not Found in Virtual FS', { status: 404 });
      }
      return new Response(item.content, {
        status: 200,
        headers: {
          'Content-Type': norm.endsWith('.json') ? 'application/json' : 'text/plain',
        },
      });
    }

    if (method === 'MOVE') {
      const dest = headers['Destination'] || headers['destination'];
      if (!dest) return new Response('Bad Request', { status: 400 });
      const destNorm = normalizePath(dest);
      const item = virtualFS.get(norm);
      if (!item) return new Response('Source not found in Virtual FS', { status: 404 });
      persistVFS(destNorm, item);
      persistVFS(norm, undefined, true);
      return new Response('Moved in Virtual FS', { status: 201 });
    }

    if (method === 'DELETE') {
      persistVFS(norm, undefined, true);
      // Also delete children if directory
      const dirPrefix = norm.endsWith('/') ? norm : `${norm}/`;
      for (const [k] of virtualFS.entries()) {
        if (k.startsWith(dirPrefix)) {
          persistVFS(k, undefined, true);
        }
      }
      return new Response('Deleted', { status: 204 });
    }

    if (method === 'PROPFIND') {
      const dirPrefix = norm.endsWith('/') ? norm : `${norm}/`;
      const matched: WebDAVResource[] = [];
      matched.push({
        href: dirPrefix,
        name: dirPrefix.split('/').filter(Boolean).pop() || '',
        isDir: true,
      });
      for (const [key, val] of virtualFS.entries()) {
        if (key !== dirPrefix && key.startsWith(dirPrefix)) {
          const sub = key.slice(dirPrefix.length);
          const segs = sub.split('/').filter(Boolean);
          if (segs.length === 1) {
            matched.push({
              href: key,
              name: segs[0],
              isDir: val.isDir,
            });
          }
        }
      }
      return new Response(JSON.stringify(matched), {
        status: 207,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  /**
   * MKCOL: Create a collection / directory
   */
  async mkcol(path: string): Promise<boolean> {
    const res = await this.request('MKCOL', path);
    return res.status === 201 || res.status === 405 || res.status === 200; // 405 means already exists
  }

  /**
   * PUT: Write JSON or text file
   */
  async put(path: string, content: string | object): Promise<boolean> {
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const contentType = typeof content === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8';
    const res = await this.request('PUT', path, body, {
      'Content-Type': contentType,
    });
    return res.status === 201 || res.status === 200 || res.status === 204;
  }

  /**
   * GET: Read file content
   */
  async get<T = string>(path: string): Promise<T | null> {
    const res = await this.request('GET', path);
    if (!res.ok) return null;
    const text = await res.text();
    if (path.endsWith('.json')) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    }
    return text as unknown as T;
  }

  /**
   * MOVE: Rename/move file or directory (Atomic 3-step swap support)
   */
  async move(sourcePath: string, destPath: string): Promise<boolean> {
    const destNorm = normalizePath(destPath);
    const res = await this.request('MOVE', sourcePath, null, {
      Destination: destNorm,
    });
    return res.status === 201 || res.status === 204 || res.status === 200;
  }

  /**
   * DELETE: Delete file or collection
   */
  async delete(path: string): Promise<boolean> {
    const res = await this.request('DELETE', path);
    return res.status === 204 || res.status === 200 || res.status === 404;
  }

  /**
   * PROPFIND: List resources in collection
   */
  async propfind(path: string, depth: '0' | '1' = '1'): Promise<WebDAVResource[]> {
    // Ensure directory path has trailing slash for collection listing compliance
    const cleanPath = path.endsWith('/') || path.endsWith('.json') || path.endsWith('.txt') ? path : `${path}/`;
    const res = await this.request('PROPFIND', cleanPath, null, {
      Depth: depth,
      Accept: 'application/json, application/xml, text/xml, */*',
    });

    if (!res.ok) {
      return [];
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text) as WebDAVResource[];
      } catch {
        return [];
      }
    }

    // Parse standard WebDAV XML Multi-Status
    return this.parseMultiStatusXml(text);
  }

  private parseMultiStatusXml(xmlText: string): WebDAVResource[] {
    const results: WebDAVResource[] = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');

      // Check for parsing error
      if (doc.getElementsByTagName('parsererror').length > 0) {
        console.warn('[WebDAV] XML parsererror detected in response');
        return [];
      }

      // Query responses across various XML namespaces
      const responses = doc.getElementsByTagNameNS('*', 'response');

      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        const hrefElem = resp.getElementsByTagNameNS('*', 'href')[0];
        if (!hrefElem) continue;

        let href = hrefElem.textContent?.trim() || '';
        // If href contains full URL (e.g. http://host:port/webdav/...), strip host
        try {
          if (href.startsWith('http://') || href.startsWith('https://')) {
            href = new URL(href).pathname;
          }
        } catch {
          // ignore
        }

        const nameElem = resp.getElementsByTagNameNS('*', 'displayname')[0];
        let name = nameElem ? nameElem.textContent?.trim() || '' : '';
        if (!name) {
          const parts = href.split('/').filter(Boolean);
          name = parts[parts.length - 1] || '';
        }
        try {
          name = decodeURIComponent(name);
        } catch {
          // ignore
        }

        const resTypeElem = resp.getElementsByTagNameNS('*', 'resourcetype')[0];
        const hasCollectionTag = resTypeElem ? resTypeElem.getElementsByTagNameNS('*', 'collection').length > 0 : false;
        const isDir = hasCollectionTag || href.endsWith('/');

        const lenElem = resp.getElementsByTagNameNS('*', 'getcontentlength')[0];
        const size = lenElem ? parseInt(lenElem.textContent || '0', 10) : 0;

        results.push({ href, name, isDir, size });
      }
    } catch (e) {
      console.warn('[WebDAV] Failed to parse XML multistatus:', e);
    }
    return results;
  }
}

// Shared singleton instance
export const webdav = new WebDAVClient();
