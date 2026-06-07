import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, SectionList, View, ActivityIndicator, Text, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { router, Stack } from 'expo-router';
import { useAgentStore } from '@/stores/useAgentStore';
import AgentCard from '@/components/AgentCard';
import { Ionicons } from '@expo/vector-icons';

const ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'];

function getFirstLetter(str: string): string {
  if (!str) return '#';
  const char = str.trim().charAt(0);
  
  if (/[a-zA-Z]/.test(char)) {
    return char.toUpperCase();
  }
  
  const charCode = char.charCodeAt(0);
  if (charCode >= 19968 && charCode <= 40869) {
    const boundaryChar = ["啊","芭","擦","搭","蛾","发","噶","哈","击","喀","垃圾","妈","拿","哦","啪","期","然","撒","塌","挖","昔","压","匝"];
    const pinyinList = ["A","B","C","D","E","F","G","H","J","K","L","M","N","O","P","Q","R","S","T","W","X","Y","Z"];
    for (let i = 0; i < pinyinList.length; i++) {
      if (char.localeCompare(boundaryChar[i], 'zh') < 0) {
        return i === 0 ? 'A' : pinyinList[i-1];
      }
    }
    return 'Z';
  }
  
  return '#';
}

export default function AgentsScreen() {
  const { agents, loading, fetchAgents } = useAgentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLetter, setActiveLetter] = useState('A');
  const [sidebarY, setSidebarY] = useState(0);
  const [sidebarHeight, setSidebarHeight] = useState(0);
  const sectionListRef = useRef<SectionList>(null);
  const sidebarRef = useRef<View>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const safeAgents = Array.isArray(agents) ? agents.filter(Boolean) : [];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = safeAgents.filter((a: any) => {
    const name = String(a?.name || a?.displayName || '未命名智能体');
    return name.toLowerCase().includes(normalizedQuery);
  });

  const sorted = [...filtered].sort((a: any, b: any) =>
    String(a?.name || a?.displayName || '').localeCompare(String(b?.name || b?.displayName || ''), 'zh')
  );

  const sectionsMap: Record<string, any[]> = {};
  sorted.forEach(a => {
    const first = getFirstLetter(a.name);
    if (!sectionsMap[first]) {
      sectionsMap[first] = [];
    }
    sectionsMap[first].push(a);
  });

  const sections = ALPHABET.map(letter => ({
    title: letter,
    data: sectionsMap[letter] || []
  })).filter(s => s.data.length > 0);

  const scrollToLetter = (letter: string) => {
    const sectionIndex = sections.findIndex(s => s.title === letter);
    if (sectionIndex !== -1 && sectionListRef.current) {
      try {
        sectionListRef.current.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          viewOffset: 0,
          animated: false
        });
      } catch (e) {
        // ignore layout offset scroll issues
      }
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const firstItem = viewableItems[0];
      if (firstItem && firstItem.section && firstItem.section.title) {
        setActiveLetter(firstItem.section.title);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10
  }).current;

  const measureSidebar = () => {
    if (sidebarRef.current) {
      sidebarRef.current.measure((x, y, width, height, pageX, pageY) => {
        if (pageY > 0) {
          setSidebarY(pageY);
          setSidebarHeight(height);
        }
      });
    }
  };

  const handleTouch = (event: any) => {
    const pageY = event.nativeEvent.pageY;
    if (sidebarHeight > 0) {
      const relativeY = pageY - sidebarY;
      const index = Math.floor((relativeY / sidebarHeight) * ALPHABET.length);
      if (index >= 0 && index < ALPHABET.length) {
        const letter = ALPHABET[index];
        setActiveLetter(letter);
        scrollToLetter(letter);
      }
    }
  };

  if (loading && agents.length === 0) {
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
          headerTitle: '联系人',
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 17, fontWeight: '800', color: '#111827' },
          headerStyle: { backgroundColor: '#ffffff' },
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/agents/create')}
              style={styles.headerAddButton}
            >
              <Ionicons name="add" size={22} color="#3370ff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Search Input Box */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#8f959e" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索成员..."
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

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(item) => item.id}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <View style={styles.cardWrapper}>
              <AgentCard
                agent={item}
                onPress={() => router.push(`/agents/${item.id}`)}
              />
            </View>
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          onRefresh={fetchAgents}
          refreshing={loading}
          contentContainerStyle={styles.listContent}
          style={{ flex: 1 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无相关智能体</Text>
            </View>
          }
        />

        {/* Draggable Alphabet Sidebar */}
        <View
          ref={sidebarRef}
          style={styles.alphabetSidebar}
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onLayout={measureSidebar}
        >
          {ALPHABET.map((letter) => {
            const hasData = sections.some(s => s.title === letter);
            const isActive = activeLetter === letter;
            return (
              <Text 
                key={letter} 
                style={[
                  styles.alphabetText, 
                  hasData && styles.alphabetTextHighlight,
                  isActive && styles.alphabetTextActive
                ]}
              >
                {letter}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8fb',
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#f6f8fb',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 42,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2329',
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  sectionHeader: {
    backgroundColor: '#f6f8fb',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginHorizontal: 0,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#646a73',
  },
  cardWrapper: {
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f8fb',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#8f959e',
  },
  alphabetSidebar: {
    width: 24,
    backgroundColor: 'transparent',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 12,
  },
  alphabetText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#c5c7cb',
    textAlign: 'center',
    width: '100%',
    height: 14,
    lineHeight: 14,
  },
  alphabetTextHighlight: {
    color: '#3370ff',
  },
  alphabetTextActive: {
    color: '#ffffff',
    backgroundColor: '#3370ff',
    borderRadius: 7,
    overflow: 'hidden',
    fontWeight: '700',
  },
  headerAddButton: {
    marginRight: 16,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#edf4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
