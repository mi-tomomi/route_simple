(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RouteEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createRouteFinder(data) {
    const sampleDistance = 9;
    const stationById = new Map(data.stations.map(station => [station.id, station]));
    const throughServices = new Set(
      (data.throughServices || []).map(lines => [...lines].sort().join('|'))
    );
    const nodes = [];
    const adjacency = [];
    const lineNodes = new Map();
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    for (const [line, route] of Object.entries(data.routes)) {
      const selected = [];
      let last = null;
      route.points.forEach(([x, y], index) => {
        if (!last || Math.hypot(x - last.x, y - last.y) >= sampleDistance || index === route.points.length - 1) {
          const id = nodes.length;
          nodes.push({ id, x, y, line });
          adjacency.push([]);
          selected.push(id);
          last = { x, y };
        }
      });
      for (let index = 1; index < selected.length; index++) {
        const from = selected[index - 1];
        const to = selected[index];
        const weight = distance(nodes[from], nodes[to]);
        adjacency[from].push({ to, weight, transfer: 0 });
        adjacency[to].push({ to: from, weight, transfer: 0 });
      }
      if (route.closed && selected.length > 2) {
        const from = selected[0];
        const to = selected[selected.length - 1];
        const weight = distance(nodes[from], nodes[to]);
        adjacency[from].push({ to, weight, transfer: 0 });
        adjacency[to].push({ to: from, weight, transfer: 0 });
      }
      lineNodes.set(line, selected);
    }

    function nearestNode(point, line) {
      let id = null;
      let nearestDistance = Infinity;
      for (const candidateId of lineNodes.get(line) || []) {
        const candidate = nodes[candidateId];
        const candidateDistance = Math.hypot(point[0] - candidate.x, point[1] - candidate.y);
        if (candidateDistance < nearestDistance) {
          id = candidateId;
          nearestDistance = candidateDistance;
        }
      }
      return id === null ? null : { id, distance: nearestDistance };
    }

    function stationCandidate(stationId, line) {
      const station = stationById.get(stationId);
      if (!station) return null;
      return nearestNode([station.x + station.width / 2, station.y + station.height / 2], line);
    }

    class Heap {
      constructor() { this.items = []; }
      push(item) {
        this.items.push(item);
        let index = this.items.length - 1;
        while (index) {
          const parent = (index - 1) >> 1;
          if (this.items[parent][0] <= item[0]) break;
          this.items[index] = this.items[parent];
          index = parent;
        }
        this.items[index] = item;
      }
      pop() {
        if (!this.items.length) return null;
        const root = this.items[0];
        const last = this.items.pop();
        if (this.items.length) {
          let index = 0;
          while (true) {
            let child = index * 2 + 1;
            if (child >= this.items.length) break;
            if (child + 1 < this.items.length && this.items[child + 1][0] < this.items[child][0]) child++;
            if (this.items[child][0] >= last[0]) break;
            this.items[index] = this.items[child];
            index = child;
          }
          this.items[index] = last;
        }
        return root;
      }
    }

    const cache = new Map();
    return function findRoute(fromStationId, toStationId, routeLines, transferPoints, originPoint) {
      if (!routeLines || !routeLines.length || !transferPoints || transferPoints.length !== routeLines.length - 1) return [];
      const cacheKey = `${fromStationId}|${toStationId}|${routeLines.join('>')}|${JSON.stringify(transferPoints)}|${JSON.stringify(originPoint || null)}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const start = originPoint ? nearestNode(originPoint, routeLines[0]) : stationCandidate(fromStationId, routeLines[0]);
      const end = stationCandidate(toStationId, routeLines[routeLines.length - 1]);
      if (!start || !end) return [];

      const transferLinks = transferPoints.map((point, stage) => {
        const fromNode = nearestNode(point, routeLines[stage]);
        const toNode = nearestNode(point, routeLines[stage + 1]);
        if (!fromNode || !toNode) return null;
        const pair = [routeLines[stage], routeLines[stage + 1]].sort().join('|');
        const transfer = throughServices.has(pair) ? 0 : 1;
        return {
          from: fromNode.id,
          to: toNode.id,
          weight: (transfer ? 35 : 3) + distance(nodes[fromNode.id], nodes[toNode.id]),
          transfer
        };
      });
      if (transferLinks.includes(null)) return [];

      const best = new Map();
      const previous = new Map();
      const heap = new Heap();
      best.set(`${start.id}|0`, start.distance);
      heap.push([start.distance, start.id, 0]);
      let finalKey = null;
      while (heap.items.length) {
        const [cost, id, stage] = heap.pop();
        const key = `${id}|${stage}`;
        if (cost !== best.get(key)) continue;
        if (id === end.id && stage === routeLines.length - 1) {
          finalKey = key;
          break;
        }
        const edges = adjacency[id].map(edge => ({ ...edge, nextStage: stage }));
        const transferLink = transferLinks[stage];
        if (transferLink && transferLink.from === id) edges.push({ ...transferLink, nextStage: stage + 1 });
        for (const edge of edges) {
          const nextKey = `${edge.to}|${edge.nextStage}`;
          const nextCost = cost + edge.weight;
          if (nextCost < (best.get(nextKey) ?? Infinity)) {
            best.set(nextKey, nextCost);
            previous.set(nextKey, { key, transfer: edge.transfer });
            heap.push([nextCost, edge.to, edge.nextStage]);
          }
        }
      }
      if (!finalKey) {
        cache.set(cacheKey, []);
        return [];
      }
      const path = [];
      for (let key = finalKey; key;) {
        const link = previous.get(key);
        path.push({ ...nodes[Number(key.split('|')[0])], transferFromPrevious: link ? link.transfer : 0 });
        key = link ? link.key : null;
      }
      path.reverse();
      cache.set(cacheKey, path);
      return path;
    };
  }

  return { createRouteFinder };
});
