/**
 * usePostUpload.ts
 *
 * Extracts post upload logic: storage upload, post insert, tags, notifications.
 * Used by UploadScreen.
 */

import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/retry';
import { compressImage } from '../lib/imageUtils';
import type { PostWithProfile } from '../types';

type TaggedFriend = { id: string; display_name: string; username: string };

type UploadParams = {
  imageUri: string;
  caption: string;
  venueName: string;
  locationCoords: { latitude: number; longitude: number };
  taggedFriends: TaggedFriend[];
  originalPhotoDate: string | null;
  userId: string;
  profile: { username: string; display_name: string; avatar_url: string | null } | null;
};

export function usePostUpload(options: {
  addPost: (post: PostWithProfile) => void;
  onSuccess: () => void;
}) {
  const { addPost, onSuccess } = options;
  const [uploading, setUploading] = useState(false);

  const uploadPost = useCallback(
    async (params: UploadParams) => {
      const {
        imageUri,
        caption,
        venueName,
        locationCoords,
        taggedFriends,
        originalPhotoDate,
        userId,
        profile,
      } = params;

      setUploading(true);
      try {
        let finalUri = imageUri;
        try {
          finalUri = await compressImage(imageUri);
        } catch (compressErr) {
          if (__DEV__) console.error('Compression failed, using original:', compressErr);
        }

        const fileExt = 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;

        const response = await fetch(finalUri);
        const arraybuffer = await response.arrayBuffer();

        const { error: uploadError } = await withRetry(async () => {
          const result = await supabase.storage
            .from('posts')
            .upload(filePath, arraybuffer, {
              contentType: 'image/jpeg',
              upsert: false,
            });
          if (result.error) throw result.error;
          return result;
        });

        if (uploadError) {
          __DEV__ && console.error('Upload failed:', uploadError);
          throw uploadError;
        }

        const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
        const imageUrl = urlData.publicUrl;

        const postData = {
          user_id: userId,
          image_url: imageUrl,
          caption: caption.trim() || null,
          venue_name: venueName.trim() || null,
          latitude: locationCoords.latitude,
          longitude: locationCoords.longitude,
          ...(originalPhotoDate ? { created_at: originalPhotoDate } : {}),
        };

        const { data: insertedPost, error: insertError } = await withRetry(async () => {
          const result = await supabase
            .from('posts')
            .insert(postData)
            .select('id')
            .single();
          if (result.error) throw result.error;
          return result;
        });

        if (insertError) throw insertError;

        const newPostId = insertedPost?.id;

        if (profile && newPostId) {
          addPost({
            id: newPostId,
            user_id: userId,
            image_url: imageUrl,
            caption: caption.trim() || null,
            venue_name: venueName.trim() || null,
            latitude: locationCoords.latitude,
            longitude: locationCoords.longitude,
            created_at: originalPhotoDate ?? new Date().toISOString(),
            profiles: {
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
            },
            post_tags:
              taggedFriends.length > 0
                ? taggedFriends.map((f) => ({
                    tagged_user_id: f.id,
                    profiles: {
                      display_name: f.display_name,
                      username: f.username,
                    },
                  }))
                : undefined,
          } as unknown as PostWithProfile);
        }

        if (newPostId && taggedFriends.length > 0) {
          const tagInserts = taggedFriends.map((friend) => ({
            post_id: newPostId,
            tagged_user_id: friend.id,
          }));
          const { error: tagError } = await supabase.from('post_tags').insert(tagInserts);
          if (tagError) {
            __DEV__ && console.error('Failed to insert tags:', tagError);
          }

          const notificationInserts = taggedFriends.map((friend) => ({
            user_id: friend.id,
            type: 'tag',
            from_user_id: userId,
            post_id: newPostId,
          }));
          const { error: notifError } = await supabase
            .from('notifications')
            .insert(notificationInserts);
          if (notifError) {
            __DEV__ && console.error('Failed to send tag notifications:', notifError);
          }
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
      } catch (error: unknown) {
        if (__DEV__) console.error('Post failed:', error);
        Alert.alert('Error', 'Failed to post. Please try again.');
        throw error;
      } finally {
        setUploading(false);
      }
    },
    [addPost, onSuccess]
  );

  return { uploading, uploadPost };
}
