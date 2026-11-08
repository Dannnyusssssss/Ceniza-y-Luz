import { describe, expect, it } from 'vitest';
import type { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { roofVertexData } from '../src/render/meshBuilder';

/**
 * Para cada triángulo, el signo de (normal según el orden de sus índices) · (hacia fuera de la pieza).
 * Las piezas son convexas: el promedio de los vértices queda dentro.
 */
function windingSigns(data: VertexData): number[] {
  const p = Array.from(data.positions ?? []);
  const i = Array.from(data.indices ?? []);
  const count = p.length / 3;
  const center = [0, 1, 2].map((axis) => {
    let sum = 0;
    for (let v = 0; v < count; v++) sum += p[v * 3 + axis] ?? 0;
    return sum / count;
  });
  const at = (index: number, axis: number): number => p[(i[index] ?? 0) * 3 + axis] ?? 0;
  const signs: number[] = [];
  for (let t = 0; t < i.length; t += 3) {
    const [ax, ay, az] = [at(t, 0), at(t, 1), at(t, 2)];
    const [ux, uy, uz] = [at(t + 1, 0) - ax, at(t + 1, 1) - ay, at(t + 1, 2) - az];
    const [vx, vy, vz] = [at(t + 2, 0) - ax, at(t + 2, 1) - ay, at(t + 2, 2) - az];
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const outward = [0, 1, 2].map(
      (axis) => (at(t, axis) + at(t + 1, axis) + at(t + 2, axis)) / 3 - (center[axis] ?? 0),
    );
    signs.push(Math.sign(normal.reduce((sum, n, axis) => sum + n * (outward[axis] ?? 0), 0)));
  }
  return signs;
}

describe('roofVertexData', () => {
  it('todas sus caras miran hacia fuera, igual que las de una caja del motor', () => {
    const [boxSign] = windingSigns(CreateBoxVertexData({ width: 2, height: 2, depth: 2 }));
    const signs = windingSigns(roofVertexData(8.7, 1.5, 6.9));
    expect(signs).toHaveLength(8);
    for (const sign of signs) expect(sign).toBe(boxSign);
  });

  it('las normales de las dos aguas apuntan hacia arriba', () => {
    const normals = roofVertexData(8, 1.5, 6).normals ?? [];
    // Vértices de la cumbrera: 2 y 3.
    expect(normals[2 * 3 + 1]).toBeGreaterThan(0);
    expect(normals[3 * 3 + 1]).toBeGreaterThan(0);
  });
});
