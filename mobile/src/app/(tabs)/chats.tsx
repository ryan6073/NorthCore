import React, { useEffect, useState } from 'react';
import { StyleSheet, FlatList, View, ActivityIndicator, Text, TouchableOpacity, TextInput, Alert, Platform, Modal, Dimensions } from 'react-native';
import { router, Stack } from 'expo-router';
import { useConversationStore } from '@/stores/useConversationStore';
import { useAgentStore } from '@/stores/useAgentStore';
import ConversationItem from '@/components/ConversationItem';
import { Ionicons } from '@expo/vector-icons';

export default function ChatsScreen() {
  const { conversations, loading, fetchConversations, pinConversation, archiveConversation, deleteConversation } = useConversationStore();
  const { agents } = useAgentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'agent' | 'archived'>('chat');
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuY, setMenuY] = useState(200);
  const [menuX, setMenuX] = useState(150);

  useEffect(() => {
    fetchConversations();
  }, []);

  const filteredConversations = (conversations || []).filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Grouping matches frontend logic:
  // - archived: isArchived is true
  // - agent: mode is 'agent' or starts with agent list bindings
  // - chat: standard conversations (1v1 single or group) that are not archived
  const archivedList = filteredConversations.filter(c => (c as any).isArchived);
  
  const chatList = filteredConversations.filter(c => 
    !(c as any).isArchived && c.mode !== 'agent'
  );

  const agentChatList = filteredConversations.filter(c => 
    !(c as any).isArchived && c.mode === 'agent'
  );

  const sortConversations = (list: any[]) => {
    return [...list].sort((a, b) => {
      // Pinned status takes priority
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // Then sort by latest time descending
      const timeA = a.updatedAt || a.createdAt || '';
      const timeB = b.updatedAt || b.createdAt || '';
      return timeB.localeCompare(timeA);
    });
  };

  const getActiveData = () => {
    switch (activeTab) {
      case 'agent': return sortConversations(agentChatList);
      case 'archived': return sortConversations(archivedList);
      default: return sortConversations(chatList);
    }
  };

  const renderListHeader = () => (
    <>
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#8f959e" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索会话..."
            placeholderTextColor="#8f959e"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#8f959e" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabsWrapper}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'chat' && styles.tabBtnActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            Chat ({chatList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'agent' && styles.tabBtnActive]}
          onPress={() => setActiveTab('agent')}
        >
          <Text style={[styles.tabText, activeTab === 'agent' && styles.tabTextActive]}>
            Agent chat ({agentChatList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'archived' && styles.tabBtnActive]}
          onPress={() => setActiveTab('archived')}
        >
          <Text style={[styles.tabText, activeTab === 'archived' && styles.tabTextActive]}>
            已归档 ({archivedList.length})
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3370ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: '会话列表',
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 17, fontWeight: '700', color: '#1f2329' },
          headerStyle: { backgroundColor: '#ffffff' },
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/chats/create')}
              style={{ marginRight: 16 }}
            >
              <Ionicons name="add" size={24} color="#3370ff" />
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        style={styles.list}
        data={getActiveData()}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderListHeader}
        renderItem={({ item }) => (
          <ConversationItem
            conversation={item}
            onPress={() => router.push(`/chats/${item.id}`)}
            onLongPress={(event) => {
              const pageY = event?.nativeEvent?.pageY || 200;
              const pageX = event?.nativeEvent?.pageX || 150;
              setSelectedConv(item);
              setMenuY(pageY);
              setMenuX(pageX);
              setMenuVisible(true);
            }}
          />
        )}
        onRefresh={fetchConversations}
        refreshing={loading}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        scrollEventThrottle={16}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={40} color="#c5c7cb" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>暂无相关会话</Text>
          </View>
        }
      />

      {/* Long-Press Action Menu Modal */}
      {selectedConv && (() => {
        const screenWidth = Dimensions.get('window').width;
        const screenHeight = Dimensions.get('window').height;
        const menuHeight = selectedConv.mode === 'agent' ? 110 : 160;
        let topPosition = menuY + 15; // Position below touch point with offset for arrow
        let arrowDirection = 'up';

        if (topPosition + menuHeight > screenHeight - 60) {
          topPosition = menuY - menuHeight - 15; // Position above touch point
          arrowDirection = 'down';
        }

        if (topPosition < 60) {
          topPosition = 60;
          arrowDirection = topPosition < menuY ? 'down' : 'up';
        }

        let leftPosition = menuX - 130;
        if (leftPosition + 260 > screenWidth - 16) {
          leftPosition = screenWidth - 260 - 16;
        }
        if (leftPosition < 16) {
          leftPosition = 16;
        }

        // Align arrow horizontally with pageX touch location relative to the menu box
        let arrowLeft = menuX - leftPosition - 8;
        if (arrowLeft < 16) arrowLeft = 16;
        if (arrowLeft > 260 - 32) arrowLeft = 260 - 32;

        return (
          <Modal
            transparent
            visible={menuVisible}
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setMenuVisible(false)}
            >
              <View style={[styles.menuBox, { top: topPosition, left: leftPosition }]}>
                {arrowDirection === 'up' ? (
                  <View style={[styles.arrow, styles.arrowUp, { left: arrowLeft }]} />
                ) : (
                  <View style={[styles.arrow, styles.arrowDown, { left: arrowLeft }]} />
                )}
                
                <Text style={styles.menuHeader} numberOfLines={1}>{selectedConv.title}</Text>
                
                <TouchableOpacity
                  style={styles.menuBtn}
                  onPress={() => {
                    pinConversation(selectedConv.id, !selectedConv.isPinned);
                    setMenuVisible(false);
                  }}
                >
                  <Ionicons name="pin-outline" size={18} color="#1f2329" />
                  <Text style={styles.menuBtnText}>{selectedConv.isPinned ? '取消置顶' : '会话置顶'}</Text>
                </TouchableOpacity>

                {selectedConv.mode !== 'agent' && (
                  <TouchableOpacity
                    style={styles.menuBtn}
                    onPress={() => {
                      archiveConversation(selectedConv.id, !selectedConv.isArchived);
                      setMenuVisible(false);
                    }}
                  >
                    <Ionicons name="archive-outline" size={18} color="#1f2329" />
                    <Text style={styles.menuBtnText}>{selectedConv.isArchived ? '激活会话' : '归档会话'}</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.menuDivider} />

                <TouchableOpacity
                  style={styles.menuBtn}
                  onPress={() => {
                    setMenuVisible(false);
                    const performDelete = () => {
                      deleteConversation(selectedConv.id);
                    };

                    if (Platform.OS === 'web') {
                      if (window.confirm(`确认删除会话 "${selectedConv.title}" 吗？该操作不可恢复！`)) {
                        performDelete();
                      }
                    } else {
                      Alert.alert('警告', `确认删除会话 "${selectedConv.title}" 吗？该操作将清空所有消息记录！`, [
                        { text: '取消', style: 'cancel' },
                        { text: '删除', style: 'destructive', onPress: performDelete }
                      ]);
                    }
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ff3b30" />
                  <Text style={[styles.menuBtnText, { color: '#ff3b30' }]}>删除会话</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2329',
    padding: 0,
  },
  tabsWrapper: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
  },
  tabBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#3370ff',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#646a73',
  },
  tabTextActive: {
    color: '#3370ff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#8f959e',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuBox: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: 260,
    paddingVertical: 6,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#eff0f1',
  },
  menuHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8f959e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
    marginBottom: 4,
  },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  menuBtnText: {
    fontSize: 14,
    color: '#1f2329',
    marginLeft: 12,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#eff0f1',
    marginVertical: 4,
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
  },
  arrowUp: {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
    borderTopColor: 'transparent',
    borderBottomWidth: 8,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 0,
    top: -8,
    alignSelf: 'center',
  },
  arrowDown: {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderTopColor: '#ffffff',
    borderBottomWidth: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    bottom: -8,
    alignSelf: 'center',
  },
});
