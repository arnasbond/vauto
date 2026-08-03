-- Persist full public gallery as first-class JSONB (cover remains listings.image = images[0]).
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from attributes.galleryUrls when present.
UPDATE listings
SET images = COALESCE(attributes->'galleryUrls', '[]'::jsonb)
WHERE (images IS NULL OR images = '[]'::jsonb)
  AND jsonb_typeof(attributes->'galleryUrls') = 'array'
  AND jsonb_array_length(attributes->'galleryUrls') > 0;

-- Cover = first gallery URL when cover missing / stock / non-image page URL.
UPDATE listings
SET image = images->>0
WHERE jsonb_typeof(images) = 'array'
  AND jsonb_array_length(images) > 0
  AND (
    image IS NULL
    OR btrim(image) = ''
    OR image ILIKE '%unsplash.com%'
    OR image ILIKE '%picsum.photos%'
    OR (image ILIKE '%/listing/%' AND image NOT ILIKE '%.jpg%' AND image NOT ILIKE '%.jpeg%' AND image NOT ILIKE '%.png%' AND image NOT ILIKE '%.webp%')
  );

CREATE INDEX IF NOT EXISTS listings_images_gin ON listings USING gin (images);
