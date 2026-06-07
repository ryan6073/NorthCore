import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Artifact, ArtifactVersion } from '@/types';
import { useMessageStore } from '@/stores/useMessageStore';
import ArtifactPreview from './ArtifactPreview';

interface ArtifactFullScreenModalProps {
  visible: boolean;
  artifact: Artifact | null;
  initialVersion?: ArtifactVersion;
  onClose: () => void;
}

/**
 * 全屏产物查看器
 */
export default function ArtifactFullScreenModal({
  visible,
  artifact,
  initialVersion,
  onClose,
}: ArtifactFullScreenModalProps) {
  const artifactVersions = useMessageStore((state) => state.artifactVersions);
  const loadArtifactContent = useMessageStore((state) => state.loadArtifactContent);

  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [showVersionPicker, setShowVersionPicker] = useState(false);

  // ── 获取所有版本 ──
  const versions = useMemo(() => {
    if (!artifact) return [];
    return artifactVersions[artifact.id] || [];
  }, [artifactVersions, artifact?.id]);

  // ── 按版本号排序 ──
  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => a.version - b.version);
  }, [versions]);

  const currentVersion = sortedVersions[selectedVersionIndex] || initialVersion || null;

  // ── 如果没有版本，自动加载 ──
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!artifact || versions.length > 0) return;
    setLoading(true);
    loadArtifactContent(artifact.id).finally(() => setLoading(false));
  }, [artifact?.id]);

  // reset index when artifact changes
  useEffect(() => {
    setSelectedVersionIndex(0);
    setShowVersionPicker(false);
  }, [artifact?.id]);

  // ── 类型图标 ──
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'code': return 'code-slash';
      case 'html': return 'globe-outline';
      case 'markdown': return 'document-text';
      case 'mermaid': return 'git-network-outline';
      case 'image': return 'image-outline';
      case 'document': return 'document-text-outline';
      case 'ppt': return 'easel-outline';
      case 'diff': return 'git-compare-outline';
      default: return 'document-text-outline';
    }
  };

  if (!artifact) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />

        {/* ── 顶部导航栏 ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#1f2329" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {artifact.title}
            </Text>
            <Text style={styles.headerSubtitle}>
              {artifact.type.toUpperCase()} · v{artifact.latestVersion || '?'}
            </Text>
          </View>

          {/* ── 版本选择 ── */}
          {sortedVersions.length > 1 && (
            <TouchableOpacity
              onPress={() => setShowVersionPicker(!showVersionPicker)}
              style={styles.versionBtn}
            >
              <Text style={styles.versionBtnText}>
                v{currentVersion?.version || artifact.latestVersion}
              </Text>
              <Ionicons
                name={showVersionPicker ? 'chevron-up' : 'chevron-down'}
                size={12}
                color="#3370ff"
              />
            </TouchableOpacity>
          )}

          <View style={{ width: 40 }} />
        </View>

        {/* ── 版本选择下拉 ── */}
        {showVersionPicker && sortedVersions.length > 1 && (
          <View style={styles.versionPicker}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sortedVersions.map((v, i) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.versionChip,
                    i === selectedVersionIndex && styles.versionChipActive,
                  ]}
                  onPress={() => {
                    setSelectedVersionIndex(i);
                    setShowVersionPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.versionChipText,
                      i === selectedVersionIndex && styles.versionChipTextActive,
                    ]}
                  >
                    v{v.version}
                  </Text>
                  {v.changeSummary && (
                    <Text style={styles.versionChipSummary} numberOfLines={1}>
                      {v.changeSummary}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 产物信息栏 ── */}
        <View style={styles.infoBar}>
          <View style={styles.infoIcon}>
            <Ionicons name={getTypeIcon(artifact.type) as any} size={14} color="#3370ff" />
          </View>
          <Text style={styles.infoText}>{artifact.type.toUpperCase()}</Text>
          {artifact.size ? (
            <>
              <Text style={styles.infoDot}>·</Text>
              <Text style={styles.infoText}>{formatSize(artifact.size)}</Text>
            </>
          ) : null}
          {currentVersion?.changeSummary ? (
            <>
              <Text style={styles.infoDot}>·</Text>
              <Text style={styles.infoText} numberOfLines={1}>{currentVersion.changeSummary}</Text>
            </>
          ) : null}
        </View>

        {/* ── 内容区域 ── */}
        <View style={styles.contentContainer}>
          <ArtifactPreview
            artifact={artifact}
            version={currentVersion}
            loading={loading && sortedVersions.length === 0}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2329',
    maxWidth: 200,
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#8f959e',
    marginTop: 1,
  },
  versionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#deebff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
  },
  versionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3370ff',
  },
  versionPicker: {
    backgroundColor: '#f5f6f7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
  },
  versionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee0e3',
    marginRight: 8,
  },
  versionChipActive: {
    backgroundColor: '#deebff',
    borderColor: '#3370ff',
  },
  versionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#646a73',
  },
  versionChipTextActive: {
    color: '#3370ff',
  },
  versionChipSummary: {
    fontSize: 9,
    color: '#8f959e',
    maxWidth: 100,
    marginTop: 1,
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fafbfc',
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
    gap: 6,
  },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#deebff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 11,
    color: '#646a73',
  },
  infoDot: {
    fontSize: 11,
    color: '#dee0e3',
  },
  contentContainer: {
    flex: 1,
    padding: 12,
  },
});
