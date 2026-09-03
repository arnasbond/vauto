"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MapContainer, TileLayer, useMap, useMapEvents, Popup } from "react-leaflet";

import L from "leaflet";

import Supercluster from "supercluster";

import { listingPath } from "@/lib/seo";

import { getListingCoverImage } from "@/lib/listing-image";

import { capNativeFeed, NATIVE_MAP_MAX } from "@/lib/native-perf";

import { resolveMapTileProvider } from "@/lib/map-provider";

import { enrichListingCoords, mapGeoContextFromUrl } from "@/lib/geocoding";

import type { ScoredListing } from "@/lib/types";

import "leaflet/dist/leaflet.css";

/** Clusters dissolve from this zoom — photo markers on streets */
const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS = 48;

/**
 * F8 — tile-ready contract v2. `ready` is proven ONLY by a really visible
 * tile INSIDE the active map container:
 *   - class `.leaflet-tile-loaded` present;
 *   - layout width > 0 and height > 0;
 *   - computed `visibility !== hidden`, `display !== none`, opacity > 0.
 * The Leaflet `load` event is intentionally NOT trusted: it can fire while
 * tiles are still hidden or absent. `tileerror` or the 8s timeout leads to
 * `degraded`, and once degraded no late signal may restore `ready`. All
 * probing is scoped to `containerRef` — never `document.querySelectorAll` —
 * so tiles from stale containers, remounts or other maps cannot leak in.
 */
const MAP_TILE_TIMEOUT_MS = 8000;

function isReallyVisibleTile(tile: HTMLImageElement): boolean {
  if (!tile.classList.contains("leaflet-tile-loaded")) return false;
  if (tile.offsetWidth <= 0 || tile.offsetHeight <= 0) return false;
  const style = window.getComputedStyle(tile);
  if (style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (style.display === "none") return false;
  const opacity = Number.parseFloat(style.opacity);
  if (!Number.isFinite(opacity) || opacity <= 0) return false;
  return true;
}

function MapReadinessSignals({
  onTileError,
}: {
  onTileError: () => void;
}) {
  const map = useMap();
  useEffect(() => {
    const handleTileError = () => onTileError();
    map.on("tileerror", handleTileError);
    return () => {
      map.off("tileerror", handleTileError);
    };
  }, [map, onTileError]);
  useEffect(() => {
    // Mounted in a (re)created container: let layout settle, then re-measure.
    const t = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

type GeoListing = ScoredListing & { latitude: number; longitude: number };

type ClusterFeature = Supercluster.PointFeature<{
  cluster: boolean;
  listing?: ScoredListing;
  point_count?: number;
}>;

function spreadDuplicateCoords(listings: GeoListing[]): GeoListing[] {
  const key = (l: GeoListing) => `${l.latitude.toFixed(5)}:${l.longitude.toFixed(5)}`;
  const groups = new Map<string, GeoListing[]>();

  for (const listing of listings) {
    const k = key(listing);
    const bucket = groups.get(k) ?? [];
    bucket.push(listing);
    groups.set(k, bucket);
  }

  return listings.map((listing) => {
    const group = groups.get(key(listing))!;
    if (group.length <= 1) return listing;

    const index = group.findIndex((l) => l.id === listing.id);
    const angle = (index / group.length) * Math.PI * 2;
    const radius = 0.004 + group.length * 0.0008;
    return {
      ...listing,
      latitude: listing.latitude + Math.cos(angle) * radius,
      longitude: listing.longitude + Math.sin(angle) * radius,
    };
  });
}

function clusterIcon(count: number) {
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  return L.divIcon({
    className: "",
    html: `<div data-map-cluster-count="${count}" style="width:${size}px;height:${size}px;border-radius:9999px;background:var(--ds-brand,#10b981);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function photoIcon(image: string, title: string) {
  return L.divIcon({
    className: "",
    html: `<div data-map-marker="1" title="${title.replace(/"/g, "&quot;")}" style="width:44px;height:44px;border-radius:10px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);background:#e5e7eb"><img src="${image}" alt="" style="width:100%;height:100%;object-fit:cover" /></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function MapLayers({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: L.LatLngBounds, zoom: number) => void;
}) {
  const map = useMap();

  useMapEvents({
    moveend: () => onBoundsChange(map.getBounds(), map.getZoom()),
    zoomend: () => onBoundsChange(map.getBounds(), map.getZoom()),
  });

  useEffect(() => {
    onBoundsChange(map.getBounds(), map.getZoom());
  }, [map, onBoundsChange]);

  return null;
}

function ClusterMarkers({
  clusters,
  index,
}: {
  clusters: Array<{ feature: ClusterFeature; lat: number; lng: number }>;
  index: Supercluster;
}) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const { feature, lat, lng } of clusters) {
      const props = feature.properties;
      let marker: L.Marker;

      if (props.cluster) {
        const count = props.point_count ?? 0;
        marker = L.marker([lat, lng], { icon: clusterIcon(count) });
        marker.on("click", () => {
          const clusterId = feature.id;
          if (typeof clusterId === "number") {
            const expansionZoom = index.getClusterExpansionZoom(clusterId);
            map.setView([lat, lng], Math.min(expansionZoom + 1, 18));
          } else {
            map.setView([lat, lng], Math.min(map.getZoom() + 2, 18));
          }
        });
      } else if (props.listing) {
        const listing = props.listing;
        marker = L.marker([lat, lng], {
          icon: photoIcon(getListingCoverImage(listing), listing.title),
        });
        marker.on("click", () => {
          window.location.href = listingPath(listing);
        });
      } else {
        continue;
      }

      marker.addTo(map);
      markersRef.current.push(marker);
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [clusters, map, index]);

  return null;
}

function MapContent({
  clusters,
  index,
  geoListings,
  onBoundsChange,
  provider,
  onTileError,
}: {
  clusters: Array<{ feature: ClusterFeature; lat: number; lng: number }>;
  index: Supercluster;
  geoListings: GeoListing[];
  onBoundsChange: (bounds: L.LatLngBounds, zoom: number) => void;
  provider: ReturnType<typeof resolveMapTileProvider>;
  onTileError: () => void;
}) {
  return (
    <>
        <MapContainer
          center={[55.1694, 23.8813]}
          zoom={7}
          maxZoom={18}
          className="h-[min(70vh,520px)] w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution={provider.attribution}
            url={provider.url}
          />
          <MapReadinessSignals
            onTileError={onTileError}
          />
          <MapLayers onBoundsChange={onBoundsChange} />
          <ClusterMarkers clusters={clusters} index={index} />
        {/* Minimal accessible popup: every visible geo listing is reachable
            as a keyboard/screen-reader fallback inside the map container. */}
        {geoListings.slice(0, 20).map((listing) => (
          <Popup
            key={listing.id}
            position={[listing.latitude, listing.longitude]}
          >
            <a
              href={listingPath(listing)}
              className="vauto-text-body"
              style={{ fontWeight: 600 }}
            >
              {listing.title}
            </a>
            <div className="vauto-text-subtle">Atidaryti skelbimą</div>
          </Popup>
        ))}
      </MapContainer>
    </>
  );
}

/** Tile error / degraded state — canonical results remain accessible. */
function MapUnavailableState({ geoCount }: { geoCount: number }) {
  return (
    <div
      data-map-degraded="1"
      className="rounded-2xl border border-dashed border-[var(--vauto-border-input)] bg-[var(--vauto-surface-page)] p-5 text-sm text-[var(--vauto-text-body)]"
    >
      <p className="mb-2 font-medium text-[var(--vauto-text-heading)]">
        Žemėlapis šiuo metu negalimas
      </p>
      <p className="mb-3 text-[var(--vauto-text-subtle)]">
        Žemėlapio paslauga nepasiekiama — jūsų paieška ir rezultatai išlieka
        nepakeisti. Galite toliau naršyti sąrašu.
      </p>
      <a
        href="#listing-results"
        data-map-fallback-list="1"
        className="vauto-btn-secondary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-border-input)] px-4 py-2.5 text-sm font-medium"
      >
        Rodyti {geoCount > 0 ? `${geoCount} skelbimų sąrašą` : "rezultatų sąrašą"}
      </a>
    </div>
  );
}

export function ListingMapViewInner({ listings }: { listings: ScoredListing[] }) {
  const provider = useMemo(() => resolveMapTileProvider(), []);

  const cappedListings = useMemo(
    () => capNativeFeed(listings, NATIVE_MAP_MAX),
    [listings]
  );

  const geoListings = useMemo(() => {
    const ctx = mapGeoContextFromUrl(window.location.href);
    const withCoords = cappedListings
      .map((l) => enrichListingCoords(l, { geoContext: ctx }))
      .filter(
        (l): l is GeoListing =>
          l != null && l.latitude != null && l.longitude != null
      );
    return spreadDuplicateCoords(withCoords);
  }, [cappedListings]);

  const index = useMemo(() => {
    const sc = new Supercluster({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      minPoints: 2,
    });
    sc.load(
      geoListings.map((l) => ({
        type: "Feature" as const,
        properties: { cluster: false, listing: l },
        geometry: { type: "Point" as const, coordinates: [l.longitude, l.latitude] },
      }))
    );
    return sc;
  }, [geoListings]);

  const [view, setView] = useState({
    bounds: L.latLngBounds([53.9, 20.9], [54.7, 26.8]),
    zoom: 7,
  });

  // Stage 22B — deterministic tile-failure detection. A failed tile image
  // must NOT crash search nor mutate canonical state: we show a graceful
  // degraded state that still surfaces the underlying result set.
  // F8 — plus the READY contract v2: only a REALLY VISIBLE tile (the
  // `.leaflet-tile-loaded` class with positive size and visible computed
  // style) inside THIS container marks the map ready; `load` events are
  // ignored; otherwise the degraded fallback appears after
  // MAP_TILE_TIMEOUT_MS, and no late signal may restore `ready`.
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "degraded">("loading");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onError = (ev: Event) => {
      const target = ev.target;
      if (
        target instanceof HTMLImageElement &&
        target.closest(".leaflet-tile-container")
      ) {
        setMapStatus("degraded");
      }
    };
    el.addEventListener("error", onError, true);
    return () => el.removeEventListener("error", onError, true);
  }, []);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      // Scope strictly to the ACTIVE container of this map instance; never
      // document-wide. A stale/detached container (remount or degraded swap)
      // simply ends the scan.
      const el = containerRef.current;
      if (!el || !el.isConnected) {
        window.clearInterval(id);
        return;
      }
      const candidates = el.querySelectorAll<HTMLImageElement>(
        ".leaflet-tile-loaded"
      );
      for (const tile of Array.from(candidates)) {
        if (isReallyVisibleTile(tile)) {
          // Once degraded, a late tile must NOT restore ready.
          setMapStatus((prev) => (prev === "degraded" ? prev : "ready"));
          window.clearInterval(id);
          return;
        }
      }
      if (Date.now() - started >= MAP_TILE_TIMEOUT_MS) {
        // Unambiguous terminal state: only `loading` may degrade.
        setMapStatus((prev) => (prev === "ready" ? prev : "degraded"));
        window.clearInterval(id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const clusters = useMemo(() => {
    const zoom = Math.round(view.zoom);
    const bbox: [number, number, number, number] = [
      view.bounds.getWest(),
      view.bounds.getSouth(),
      view.bounds.getEast(),
      view.bounds.getNorth(),
    ];
    return index.getClusters(bbox, zoom).map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return { feature: feature as ClusterFeature, lat, lng };
    });
  }, [index, view]);

  if (geoListings.length === 0) {
    return (
      <div
        data-map-empty="1"
        className="flex h-[min(70vh,520px)] items-center justify-center rounded-2xl border border-dashed border-[var(--vauto-border-input)] bg-[var(--vauto-surface-page)] text-sm text-[var(--vauto-text-subtle)]"
      >
        Šiai paieškai žemėlapyje nėra skelbimų su koordinatėmis.
      </div>
    );
  }

  if (mapStatus === "degraded") {
    return (
      <div ref={containerRef} className="mt-3">
        <MapUnavailableState geoCount={geoListings.length} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-map-container="1"
      data-map-status={mapStatus}
      aria-busy={mapStatus === "loading"}
      className="mt-3"
    >
      <div className="relative overflow-hidden rounded-2xl border border-[var(--vauto-border)] shadow-sm">
        <MapContent
          clusters={clusters}
          index={index}
          geoListings={geoListings}
          onBoundsChange={(bounds, zoom) => setView({ bounds, zoom })}
          provider={provider}
          onTileError={() => setMapStatus("degraded")}
        />
        {mapStatus === "loading" ? (
          <div
            data-map-loading="1"
            aria-live="polite"
            className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-2 bg-[var(--vauto-surface-page)]/95 text-sm text-[var(--vauto-text-subtle)]"
          >
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--vauto-border-input)] border-t-[var(--vauto-primary)]" aria-hidden />
            Žemėlapis kraunamas…
          </div>
        ) : null}
        <p
          data-map-footer="1"
          data-map-listing-count={geoListings.length}
          className="border-t border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-3 py-2 text-[11px] text-[var(--vauto-text-subtle)]"
        >
          {geoListings.length} skelbimų žemėlapyje · priartinkite, kad matytumėte
          nuotraukas
        </p>
        {/* 22B.1 AUD-02 — semantic marker fallback: every geocoded listing is
            reachable via the accessibility tree even while the visual map is
            active. sr-only keeps the visual layout pristine. */}
        <nav
          aria-label="Skelbimai žemėlapyje"
          className="sr-only"
          data-map-marker-list="1"
        >
          {geoListings.map((listing) => (
            <a key={listing.id} href={listingPath(listing)}>
              {listing.title}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
