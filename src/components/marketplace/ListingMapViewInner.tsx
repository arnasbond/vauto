"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import { listingPath } from "@/lib/seo";
import { getListingCoverImage } from "@/lib/listing-image";
import type { ScoredListing } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type GeoListing = ScoredListing & { latitude: number; longitude: number };

type ClusterFeature = Supercluster.PointFeature<{
  cluster: boolean;
  listing?: ScoredListing;
  point_count?: number;
}>;

function ensureCoords(listing: ScoredListing): GeoListing | null {
  if (typeof listing.latitude === "number" && typeof listing.longitude === "number") {
    return listing as GeoListing;
  }
  return null;
}

function clusterIcon(count: number) {
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#1167b1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function photoIcon(image: string, title: string) {
  return L.divIcon({
    className: "",
    html: `<div title="${title.replace(/"/g, "&quot;")}" style="width:44px;height:44px;border-radius:10px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);background:#e5e7eb"><img src="${image}" alt="" style="width:100%;height:100%;object-fit:cover" /></div>`,
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
            map.setView([lat, lng], index.getClusterExpansionZoom(clusterId));
          } else {
            map.setView([lat, lng], map.getZoom() + 2);
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

export function ListingMapViewInner({ listings }: { listings: ScoredListing[] }) {
  const geoListings = useMemo(
    () => listings.map(ensureCoords).filter((l): l is GeoListing => l != null),
    [listings]
  );

  const index = useMemo(() => {
    const sc = new Supercluster({ radius: 56, maxZoom: 18 });
    sc.load(
      geoListings.map((l) => ({
        type: "Feature" as const,
        properties: { cluster: false, listing: l },
        geometry: { type: "Point" as const, coordinates: [l.longitude, l.latitude] },
      }))
    );
    return sc;
  }, [geoListings]);

  const [view, setView] = useState({ bounds: L.latLngBounds([53.9, 20.9], [54.7, 26.8]), zoom: 7 });

  const clusters = useMemo(() => {
    const bbox: [number, number, number, number] = [
      view.bounds.getWest(),
      view.bounds.getSouth(),
      view.bounds.getEast(),
      view.bounds.getNorth(),
    ];
    return index.getClusters(bbox, Math.round(view.zoom)).map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return { feature: feature as ClusterFeature, lat, lng };
    });
  }, [index, view]);

  if (geoListings.length === 0) {
    return (
      <div className="flex h-[min(70vh,520px)] items-center justify-center rounded-2xl border border-dashed border-[#dde5ef] bg-white text-sm text-[#6b7280]">
        Šiai paieškai žemėlapyje nėra skelbimų su koordinatėmis.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#dde5ef] shadow-sm">
      <MapContainer
        center={[55.1694, 23.8813]}
        zoom={7}
        className="h-[min(70vh,520px)] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapLayers onBoundsChange={(bounds, zoom) => setView({ bounds, zoom })} />
        <ClusterMarkers clusters={clusters} index={index} />
      </MapContainer>
      <p className="border-t border-[#eef2f7] bg-white px-3 py-2 text-[11px] text-[#6b7280]">
        {geoListings.length} skelbimų žemėlapyje · priartinkite, kad matytumėte nuotraukas
      </p>
    </div>
  );
}
