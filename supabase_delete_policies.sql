-- Run this SQL in Supabase SQL Editor to enable post deletion.

-- Allow users to delete their own posts (cascades to reactions and comments)
CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- Allow authenticated users to delete their own photos from the posts bucket
CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'posts' AND
    auth.role() = 'authenticated'
  );
