-- Public-read badge artwork. There are deliberately no client write policies:
-- the admin-gated app route uploads through the service role after validating
-- both metadata and file content.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'badge-images',
  'badge-images',
  true,
  2097152,
  ARRAY['image/svg+xml', 'image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "badge_images_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'badge-images');
