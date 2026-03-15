/**
 * ProfileGallery.tsx
 *
 * Photo gallery grid for profile - 3 columns with thumbnails.
 * Extracted from ProfileScreen.
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { SmoothImage } from './SmoothImage';
import type { PostWithProfile } from '../types';

const GRID_GAP = 2;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL_SIZE = (SCREEN_WIDTH - theme.screenPadding * 2 - GRID_GAP * 2) / 3;

const GalleryThumbnail = memo(function GalleryThumbnail({
  post,
  userId,
  onPress,
  onLongPress,
  hasError,
  onError,
}: {
  post: PostWithProfile;
  userId: string | undefined;
  onPress: () => void;
  onLongPress: () => void;
  hasError: boolean;
  onError: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.gridCell}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {hasError ? (
        <View style={[styles.gridCellEmpty, styles.gridImagePlaceholder]}>
          <Feather name="image" size={24} color={theme.colors.textTertiary} />
        </View>
      ) : (
        <>
          <SmoothImage
            source={{ uri: post.image_url }}
            style={styles.gridImage}
            resizeMode="cover"
            onError={onError}
          />
          {post.user_id !== userId && (
            <View style={styles.tagBanner}>
              <Text style={styles.tagBannerText} numberOfLines={1}>
                tagged by @{post.profiles?.username ?? 'deleted'}
              </Text>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
});

type ProfileGalleryProps = {
  posts: PostWithProfile[];
  userId: string | undefined;
  gridImageErrors: Record<string, boolean>;
  onPostPress: (post: PostWithProfile) => void;
  onLongPressDelete: (post: PostWithProfile) => void;
  onError: (postId: string) => void;
  hasMorePosts: boolean;
  onViewAll: () => void;
};

export const ProfileGallery = memo(function ProfileGallery({
  posts,
  userId,
  gridImageErrors,
  onPostPress,
  onLongPressDelete,
  onError,
  hasMorePosts,
  onViewAll,
}: ProfileGalleryProps) {
  const GRID_SLOTS = 9;
  const gridPosts = posts.slice(0, 9);
  const gridSlots = Array.from({ length: GRID_SLOTS }, (_, i) => gridPosts[i] ?? null);

  return (
    <View style={styles.gallerySection}>
      <Text style={styles.galleryHeader}>Recent Posts</Text>
      {posts.length === 0 ? (
        <View style={styles.emptyGallery}>
          <Feather name="camera" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.emptyGalleryText}>No posts yet</Text>
        </View>
      ) : (
        <FlatList
          data={gridSlots}
          numColumns={3}
          scrollEnabled={false}
          keyExtractor={(item, index) => (item ? item.id : `empty-${index}`)}
          renderItem={({ item: post, index }) =>
            post ? (
              <GalleryThumbnail
                post={post}
                userId={userId}
                onPress={() => onPostPress(post)}
                onLongPress={() => onLongPressDelete(post)}
                hasError={!!gridImageErrors[post.id]}
                onError={() => onError(post.id)}
              />
            ) : (
              <View style={[styles.gridCell, styles.gridCellEmpty]} />
            )
          }
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          removeClippedSubviews={true}
          style={styles.grid}
        />
      )}
      {hasMorePosts && (
        <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll} activeOpacity={0.6}>
          <Feather name="grid" size={16} color={theme.colors.primary} />
          <Text style={styles.viewAllText}>View All Posts</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  gallerySection: {
    paddingHorizontal: theme.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  galleryHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'left',
  },
  grid: {
    backgroundColor: theme.colors.background,
  },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    overflow: 'hidden',
    borderRadius: 4,
    position: 'relative',
  },
  tagBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.overlayDark,
    paddingVertical: 4,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  tagBannerText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '500',
  },
  gridCellEmpty: {
    backgroundColor: theme.colors.surfaceLight,
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  emptyGallery: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyGalleryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  viewAllText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.primary,
  },
});
