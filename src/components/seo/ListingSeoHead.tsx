"use client";

import { useEffect } from "react";
import type { Listing } from "@/lib/types";
import { generateListingMetadata } from "@/lib/seo";

function setMeta(name: string, content: string, property = false) {
  const attr = property ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLinkCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

interface ListingSeoHeadProps {
  listing: Listing;
}

export function ListingSeoHead({ listing }: ListingSeoHeadProps) {
  useEffect(() => {
    const meta = generateListingMetadata(listing);
    document.title = meta.title;
    setMeta("description", meta.description);
    setMeta("og:title", meta.og.title, true);
    setMeta("og:description", meta.og.description, true);
    setMeta("og:image", meta.og.image, true);
    setMeta("og:url", meta.og.url, true);
    setMeta("og:type", meta.og.type, true);
    setMeta("og:site_name", meta.og.siteName, true);
    setLinkCanonical(meta.og.url);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", meta.og.title);
    setMeta("twitter:description", meta.og.description);
    setMeta("twitter:image", meta.og.image);
  }, [listing]);

  return null;
}
