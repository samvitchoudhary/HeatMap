/**
 * useFriendshipActions.ts
 *
 * Provides friendship action handlers that wrap the friendships service.
 * Includes loading states, error handling, and Alert confirmations.
 * Shared between FriendsScreen, FriendProfileScreen, NotificationsScreen.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
  cancelFriendRequest,
} from '../services/friendships.service';
import { useFriends } from './useFriends';

export function useFriendshipActions() {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { refresh: refreshFriends } = useFriends();

  const sendRequest = useCallback(async (fromUserId: string, toUserId: string) => {
    setActionLoading(toUserId);
    try {
      const { data, error } = await sendFriendRequest(fromUserId, toUserId);
      if (error) throw error;
      return { success: true, friendshipId: data?.id as string | undefined };
    } catch (err: any) {
      if (__DEV__) console.error('Failed to send friend request:', err);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
      return { success: false, friendshipId: undefined };
    } finally {
      setActionLoading(null);
    }
  }, []);

  const acceptRequest = useCallback(
    async (friendshipId: string) => {
      setActionLoading(friendshipId);
      try {
        const { error } = await acceptFriendRequest(friendshipId);
        if (error) throw error;
        await refreshFriends();
        return true;
      } catch (err: any) {
        if (__DEV__) console.error('Failed to accept friend request:', err);
        Alert.alert('Error', 'Failed to accept friend request. Please try again.');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [refreshFriends]
  );

  const declineRequest = useCallback(async (friendshipId: string) => {
    setActionLoading(friendshipId);
    try {
      const { error } = await declineFriendRequest(friendshipId);
      if (error) throw error;
      return true;
    } catch (err: any) {
      if (__DEV__) console.error('Failed to decline friend request:', err);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  const removeFriend = useCallback(
    async (friendshipId: string, displayName?: string) => {
      return new Promise<boolean>((resolve) => {
        Alert.alert(
          'Remove Friend',
          `Are you sure you want to remove ${displayName ?? 'this person'} as a friend?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                setActionLoading(friendshipId);
                try {
                  const { error } = await removeFriendship(friendshipId);
                  if (error) throw error;
                  await refreshFriends();
                  resolve(true);
                } catch (err: any) {
                  if (__DEV__) console.error('Failed to remove friend:', err);
                  Alert.alert('Error', 'Failed to remove friend. Please try again.');
                  resolve(false);
                } finally {
                  setActionLoading(null);
                }
              },
            },
          ]
        );
      });
    },
    [refreshFriends]
  );

  const cancelRequest = useCallback(async (friendshipId: string) => {
    setActionLoading(friendshipId);
    try {
      const { error } = await cancelFriendRequest(friendshipId);
      if (error) throw error;
      return true;
    } catch (err: any) {
      if (__DEV__) console.error('Failed to cancel friend request:', err);
      Alert.alert('Error', 'Failed to cancel request. Please try again.');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  return {
    actionLoading,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
    cancelRequest,
  };
}

