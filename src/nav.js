// Grid navigation for the derelicts: A* over inflated collider cells, plus wall-only line of sight.
// ---------------------------------------------------------------- navigation ----------------------------------------------------------------
export class Nav {
  constructor(x0, z0, x1, z1, cs = 0.6) { this.cs = cs; this.x0 = x0; this.z0 = z0; this.nx = Math.ceil((x1 - x0) / cs); this.nz = Math.ceil((z1 - z0) / cs); const n = this.nx * this.nz; this.walk = new Uint8Array(n); this.fly = new Uint8Array(n); this.g = new Float32Array(n); this.par = new Int32Array(n); this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.cur = 0; }
  build(cols, skip) {
    this.walk.fill(0); this.fly.fill(0); const inf = 0.3, cs = this.cs; this.bk = new Map();
    for (const c of cols) {
      if (c.roof || (skip && skip.has(c))) continue; const h = c.maxy ?? 99; if (h < 0.55) continue;
      const i0 = Math.max(0, Math.floor((c.minx - inf - this.x0) / cs)), i1 = Math.min(this.nx - 1, Math.floor((c.maxx + inf - this.x0) / cs)), j0 = Math.max(0, Math.floor((c.minz - inf - this.z0) / cs)), j1 = Math.min(this.nz - 1, Math.floor((c.maxz + inf - this.z0) / cs));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = this.x0 + (i + 0.5) * cs, cz = this.z0 + (j + 0.5) * cs; if (cx < c.minx - inf || cx > c.maxx + inf || cz < c.minz - inf || cz > c.maxz + inf) continue; this.walk[j * this.nx + i] = 1; if (h >= 2.5) this.fly[j * this.nx + i] = 1; }
      if (h >= 2.5) for (let bx = Math.floor(c.minx / 4); bx <= Math.floor(c.maxx / 4); bx++) for (let bz = Math.floor(c.minz / 4); bz <= Math.floor(c.maxz / 4); bz++) { const k = bx * 4096 + bz; (this.bk.get(k) || this.bk.set(k, []).get(k)).push(c); }
    }
  }
  ci(x, z) { return [Math.floor((x - this.x0) / this.cs), Math.floor((z - this.z0) / this.cs)]; }
  free(grid, i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !grid[j * this.nx + i]; }
  nearestFree(grid, i, j) { if (this.free(grid, i, j)) return [i, j]; for (let r = 1; r < 5; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if ((Math.abs(di) === r || Math.abs(dj) === r) && this.free(grid, i + di, j + dj)) return [i + di, j + dj]; return null; }
  // wall-only line of sight (fly grid holds full-height walls)
  los(ax, az, bx, bz) { const d = Math.hypot(bx - ax, bz - az); const n = Math.ceil(d / 0.3); for (let k = 1; k < n; k++) { const t = k / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t; const l = this.bk.get(Math.floor(px / 4) * 4096 + Math.floor(pz / 4)); if (l) for (const c of l) if (px > c.minx && px < c.maxx && pz > c.minz && pz < c.maxz) return false; } return true; }
  find(ax, az, bx, bz, flying = false, limit = 60000) {
    const grid = flying ? this.fly : this.walk; const a = this.nearestFree(grid, ...this.ci(ax, az)), b = this.nearestFree(grid, ...this.ci(bx, bz)); if (!a || !b) return null;
    const nx = this.nx, S = a[1] * nx + a[0], T = b[1] * nx + b[0]; if (S === T) return [{ x: bx, z: bz }];
    const st = ++this.cur, heap = [], push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = k * 2 + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    this.stamp[S] = st; this.g[S] = 0; this.par[S] = -1; push(0, S); let it = 0; const tx = T % nx, tz = (T / nx) | 0;
    while (heap.length && it++ < limit) {
      const [, cur] = pop(); if (this.closed[cur] === st) continue; this.closed[cur] = st; if (cur === T) break; const cx = cur % nx, cz = (cur / nx) | 0, gc = this.g[cur];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const ni = cx + dx, nj = cz + dz; if (!this.free(grid, ni, nj)) continue; if (dx && dz && (!this.free(grid, cx + dx, cz) || !this.free(grid, cx, cz + dz))) continue;
        const n = nj * nx + ni, ng = gc + (dx && dz ? 1.414 : 1); if (this.stamp[n] === st && this.g[n] <= ng) continue;
        this.stamp[n] = st; this.g[n] = ng; this.par[n] = cur; push(ng + Math.hypot(tx - ni, tz - nj), n);
      }
    }
    if (this.stamp[T] !== st) return null;
    const out = []; for (let n = T; n !== -1; n = this.par[n]) out.push({ x: this.x0 + ((n % nx) + 0.5) * this.cs, z: this.z0 + (((n / nx) | 0) + 0.5) * this.cs }); out.reverse(); out.shift(); return out;
  }
}

