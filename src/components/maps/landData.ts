'use client';

import * as d3 from 'd3';
import * as topojson from 'topojson-client';

let landPromise: Promise<any | null> | null = null;

export async function loadLandData(): Promise<any | null> {
  if (!landPromise) {
    landPromise = d3
      .json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
      .then((world: any) => {
        if (!world || !world.objects || !world.objects.land) {
          return null;
        }
        return topojson.feature(world, world.objects.land);
      })
      .catch(() => null);
  }

  return landPromise;
}
