import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProfileStackParamList } from '../navigation/types';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';

const GRID_GAP = 4;
const GRID_PADDING = 24;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3;

type Props = NativeStackScreenProps<ProfileStackParamList, 'Gallery'>;

export function GalleryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
  const { setCardStackOpen } = useCardStack();
  const userId = profile?.id ?? session?.user?.id;

  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);

  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:user_id(username, display_name, avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching gallery posts:', error);
      return;
    }
    setPosts((data ?? []) as PostWithProfile[]);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
    }, [fetchPosts])
  );

  useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  function handlePhotoPress(post: PostWithProfile) {
    const idx = posts.findIndex((p) => p.id === post.id);
    setSelectedInitialIndex(idx >= 0 ? idx : 0);
    setSelectedPosts(posts);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>All Posts</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={styles.gridCell}
              onPress={() => handlePhotoPress(post)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: post.image_url }}
                style={styles.gridImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack
          posts={selectedPosts}
          onClose={() => setSelectedPosts(null)}
          initialIndex={selectedInitialIndex}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {},
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSpacer: { width: 24 },
  scroll: { flex: 1 },
  gridContainer: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridImage: { width: '100%', height: '100%' },
});
