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
  Clipboard,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Artifact, ArtifactVersion } from '@/types';
import { useMessageStore } from '@/stores/useMessageStore';
import { getArtifactDetail } from '@/services/artifactService';
import ArtifactPreview from './ArtifactPreview';

interface ArtifactFullScreenModalProps {
  visible: boolean;
  artifact: Artifact | null;
  initialVersion?: ArtifactVersion;
  onClose: () => void;
}

type ArtifactViewMode = 'preview' | 'source' | 'diff';

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
  const [activeMode, setActiveMode] = useState<ArtifactViewMode>('preview');
  const [showHistory, setShowHistory] = useState(false);
  const [localVersions, setLocalVersions] = useState<ArtifactVersion[]>([]);

  // ── 获取所有版本 ──
  const versions = useMemo(() => {
    if (!artifact) return [];
    return [
      ...(artifactVersions[artifact.id] || []),
      ...(artifact.artifactId && artifact.artifactId !== artifact.id ? artifactVersions[artifact.artifactId] || [] : []),
      ...localVersions,
    ];
  }, [artifactVersions, artifact?.id, artifact?.artifactId, localVersions]);

  // ── 按版本号排序 ──
  const sortedVersions = useMemo(() => {
    const seen = new Set<string>();
    return versions
      .filter((version) => {
        const key = version.id || `${version.artifactId}-${version.version}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.version - b.version);
  }, [versions]);

  const currentVersion = sortedVersions[selectedVersionIndex] || initialVersion || null;
  const previousVersion = selectedVersionIndex > 0 ? sortedVersions[selectedVersionIndex - 1] : null;
  const currentContent = currentVersion?.content || artifact?.contentPreview || '';
  const canShowSource = artifact ? artifact.type !== 'image' : false;
  const canShowDiff = sortedVersions.length > 1 && !!previousVersion && artifact?.type !== 'image';

  // ── 如果没有版本，自动加载 ──
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!artifact || versions.some((version) => !!version.content)) return;

    let canceled = false;
    setLoading(true);

    const loadContent = async () => {
      const ids = Array.from(new Set([artifact.id, artifact.artifactId].filter(Boolean) as string[]));
      let loadedVersions: ArtifactVersion[] = [];

      for (const id of ids) {
        loadedVersions = await loadArtifactContent(id);
        if (loadedVersions.some((version) => !!version.content)) break;
      }

      if (!loadedVersions.some((version) => !!version.content)) {
        for (const id of ids) {
          try {
            const detail = await getArtifactDetail(id);
            const detailVersion = normalizeDetailVersion(detail, artifact);
            if (detailVersion?.content) {
              loadedVersions = [detailVersion];
              break;
            }
          } catch {
            // 继续尝试下一个 id，兼容后端 id / artifactId 混用。
          }
        }
      }

      if (!canceled && loadedVersions.length > 0) {
        setLocalVersions(loadedVersions);
      }
    };

    loadContent().finally(() => {
      if (!canceled) setLoading(false);
    });

    return () => {
      canceled = true;
    };
  }, [artifact?.id, artifact?.artifactId, versions.length]);

  // reset controls when artifact changes
  useEffect(() => {
    setShowVersionPicker(false);
    setShowHistory(false);
    setActiveMode('preview');
    setLocalVersions([]);
  }, [artifact?.id]);

  useEffect(() => {
    if (!artifact) return;
    if (sortedVersions.length === 0) {
      setSelectedVersionIndex(0);
      return;
    }

    const initialIndex = initialVersion
      ? sortedVersions.findIndex((v) => v.id === initialVersion.id || v.version === initialVersion.version)
      : -1;
    const latestIndex = sortedVersions.findIndex((v) => v.version === artifact.latestVersion);
    const nextIndex = initialIndex >= 0
      ? initialIndex
      : latestIndex >= 0
        ? latestIndex
        : sortedVersions.length - 1;

    setSelectedVersionIndex(nextIndex);
  }, [artifact?.id, artifact?.latestVersion, initialVersion?.id, initialVersion?.version, sortedVersions.length]);

  useEffect(() => {
    if (activeMode === 'source' && !canShowSource) setActiveMode('preview');
    if (activeMode === 'diff' && !canShowDiff) setActiveMode('preview');
  }, [activeMode, canShowDiff, canShowSource]);

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

  const handleCopy = () => {
    if (!currentContent) {
      Alert.alert('提示', '当前版本没有可复制的内容');
      return;
    }
    Clipboard.setString(currentContent);
    Alert.alert('提示', '已复制产物内容');
  };

  const renderContent = () => {
    if (activeMode === 'source') {
      return <SourceView content={currentContent} />;
    }

    if (activeMode === 'diff') {
      return (
        <DiffView
          previousContent={previousVersion?.content || ''}
          currentContent={currentContent}
          previousLabel={previousVersion ? `v${previousVersion.version}` : '上一版'}
          currentLabel={currentVersion ? `v${currentVersion.version}` : '当前版'}
        />
      );
    }

    return (
      <ArtifactPreview
        artifact={artifact}
        version={currentVersion}
        loading={loading && sortedVersions.length === 0}
      />
    );
  };

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

          <TouchableOpacity onPress={handleCopy} style={styles.headerBtn}>
            <Ionicons name="copy-outline" size={20} color="#646a73" />
          </TouchableOpacity>

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
                    v{v.version}{v.version === artifact.latestVersion ? ' 最新' : ''}
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
          {sortedVersions.length > 1 ? (
            <TouchableOpacity
              onPress={() => setShowHistory(!showHistory)}
              style={styles.historyBtn}
            >
              <Ionicons name="time-outline" size={12} color="#3370ff" />
              <Text style={styles.historyBtnText}>历史</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {showHistory && sortedVersions.length > 1 && (
          <View style={styles.historyPanel}>
            <ScrollView style={styles.historyScroll}>
              {[...sortedVersions].reverse().map((v) => {
                const versionIndex = sortedVersions.findIndex((item) => item.id === v.id);
                const active = versionIndex === selectedVersionIndex;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.historyItem, active && styles.historyItemActive]}
                    onPress={() => {
                      setSelectedVersionIndex(versionIndex);
                      setShowHistory(false);
                    }}
                  >
                    <View style={styles.historyVersionPill}>
                      <Text style={styles.historyVersionText}>v{v.version}</Text>
                    </View>
                    <View style={styles.historyItemBody}>
                      <Text style={styles.historyItemTitle} numberOfLines={1}>
                        {v.version === artifact.latestVersion ? '最新版本' : '历史版本'}
                      </Text>
                      <Text style={styles.historyItemSummary} numberOfLines={2}>
                        {v.changeSummary || '无版本说明'}
                      </Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={16} color="#3370ff" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, activeMode === 'preview' && styles.modeTabActive]}
            onPress={() => setActiveMode('preview')}
          >
            <Ionicons name="eye-outline" size={14} color={activeMode === 'preview' ? '#3370ff' : '#646a73'} />
            <Text style={[styles.modeTabText, activeMode === 'preview' && styles.modeTabTextActive]}>预览</Text>
          </TouchableOpacity>

          {canShowSource ? (
            <TouchableOpacity
              style={[styles.modeTab, activeMode === 'source' && styles.modeTabActive]}
              onPress={() => setActiveMode('source')}
            >
              <Ionicons name="code-slash-outline" size={14} color={activeMode === 'source' ? '#3370ff' : '#646a73'} />
              <Text style={[styles.modeTabText, activeMode === 'source' && styles.modeTabTextActive]}>源码</Text>
            </TouchableOpacity>
          ) : null}

          {sortedVersions.length > 1 ? (
            <TouchableOpacity
              style={[styles.modeTab, activeMode === 'diff' && styles.modeTabActive, !canShowDiff && styles.modeTabDisabled]}
              disabled={!canShowDiff}
              onPress={() => setActiveMode('diff')}
            >
              <Ionicons name="git-compare-outline" size={14} color={activeMode === 'diff' ? '#3370ff' : '#8f959e'} />
              <Text style={[styles.modeTabText, activeMode === 'diff' && styles.modeTabTextActive, !canShowDiff && styles.modeTabTextDisabled]}>差异</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── 内容区域 ── */}
        <View style={styles.contentContainer}>
          {renderContent()}
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

function normalizeDetailVersion(detail: any, artifact: Artifact): ArtifactVersion | null {
  const currentVersion = detail?.currentVersion || {};
  const content = currentVersion.content || detail?.content || detail?.contentPreview || '';

  if (!content) return null;

  return {
    id: currentVersion.id || detail?.currentVersionId || `${artifact.id}-detail-version`,
    artifactId: currentVersion.artifactId || artifact.id,
    version: currentVersion.version || detail?.latestVersion || artifact.latestVersion || 1,
    content,
    language: currentVersion.language || detail?.language || artifact.type,
    size: currentVersion.size || detail?.size || artifact.size,
    changeSummary: currentVersion.changeSummary || detail?.changeSummary,
    createdBy: currentVersion.createdBy || 'system',
    createdByType: currentVersion.createdByType || 'agent',
    createdAt: currentVersion.createdAt || detail?.updatedAt || detail?.createdAt || artifact.updatedAt || artifact.createdAt || new Date().toISOString(),
  };
}

function SourceView({ content }: { content: string }) {
  if (!content) {
    return (
      <View style={styles.emptySource}>
        <Ionicons name="document-text-outline" size={28} color="#b8bbbf" />
        <Text style={styles.emptySourceText}>当前版本暂无源码内容</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.sourceContainer} contentContainerStyle={styles.sourceContent}>
      <Text selectable style={styles.sourceText}>{content}</Text>
    </ScrollView>
  );
}

function DiffView({
  previousContent,
  currentContent,
  previousLabel,
  currentLabel,
}: {
  previousContent: string;
  currentContent: string;
  previousLabel: string;
  currentLabel: string;
}) {
  const rows = useMemo(() => buildLineDiff(previousContent, currentContent), [previousContent, currentContent]);

  if (!previousContent && !currentContent) {
    return (
      <View style={styles.emptySource}>
        <Ionicons name="git-compare-outline" size={28} color="#b8bbbf" />
        <Text style={styles.emptySourceText}>当前版本暂无可对比内容</Text>
      </View>
    );
  }

  return (
    <View style={styles.diffContainer}>
      <View style={styles.diffHeader}>
        <Text style={styles.diffHeaderText}>{previousLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color="#8f959e" />
        <Text style={styles.diffHeaderText}>{currentLabel}</Text>
      </View>
      <ScrollView style={styles.diffScroll} contentContainerStyle={styles.diffContent}>
        {rows.map((row, index) => (
          <View
            key={`${row.type}-${index}`}
            style={[
              styles.diffRow,
              row.type === 'add' && styles.diffRowAdd,
              row.type === 'remove' && styles.diffRowRemove,
            ]}
          >
            <Text style={[
              styles.diffSign,
              row.type === 'add' && styles.diffSignAdd,
              row.type === 'remove' && styles.diffSignRemove,
            ]}>
              {row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' '}
            </Text>
            <Text selectable style={styles.diffLine}>{row.text || ' '}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function buildLineDiff(previousContent: string, currentContent: string) {
  const previousLines = previousContent.split(/\r?\n/);
  const currentLines = currentContent.split(/\r?\n/);
  const maxLength = Math.max(previousLines.length, currentLines.length);
  const rows: Array<{ type: 'same' | 'add' | 'remove'; text: string }> = [];

  for (let i = 0; i < maxLength; i += 1) {
    const previousLine = previousLines[i];
    const currentLine = currentLines[i];

    if (previousLine === currentLine) {
      rows.push({ type: 'same', text: currentLine || '' });
    } else {
      if (previousLine !== undefined) rows.push({ type: 'remove', text: previousLine });
      if (currentLine !== undefined) rows.push({ type: 'add', text: currentLine });
    }
  }

  return rows;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f8fb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf3',
    backgroundColor: '#ffffff',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f5f7fb',
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
    fontWeight: '800',
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
    backgroundColor: '#edf4ff',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: '#d6e5ff',
  },
  versionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3370ff',
  },
  versionPicker: {
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf3',
  },
  versionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e6eaf2',
    marginRight: 8,
  },
  versionChipActive: {
    backgroundColor: '#edf4ff',
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
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf3',
    gap: 6,
  },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#edf4ff',
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
  historyBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#edf4ff',
  },
  historyBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3370ff',
  },
  historyPanel: {
    maxHeight: 190,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf3',
  },
  historyScroll: {
    maxHeight: 190,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
    gap: 10,
  },
  historyItemActive: {
    backgroundColor: '#f6f9ff',
  },
  historyVersionPill: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#edf4ff',
    alignItems: 'center',
  },
  historyVersionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3370ff',
  },
  historyItemBody: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f2329',
  },
  historyItemSummary: {
    marginTop: 2,
    fontSize: 11,
    color: '#646a73',
    lineHeight: 15,
  },
  modeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf3',
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f5f7fb',
    minHeight: 38,
  },
  modeTabActive: {
    backgroundColor: '#edf4ff',
    borderWidth: 1,
    borderColor: '#c8dcff',
  },
  modeTabDisabled: {
    opacity: 0.55,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#646a73',
  },
  modeTabTextActive: {
    color: '#3370ff',
  },
  modeTabTextDisabled: {
    color: '#8f959e',
  },
  contentContainer: {
    flex: 1,
    padding: 14,
  },
  sourceContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
  },
  sourceContent: {
    padding: 12,
  },
  sourceText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#e5e7eb',
  },
  emptySource: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptySourceText: {
    fontSize: 13,
    color: '#8f959e',
  },
  diffContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eff0f1',
  },
  diffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f6f7',
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
  },
  diffHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f2329',
  },
  diffScroll: {
    flex: 1,
  },
  diffContent: {
    paddingVertical: 6,
  },
  diffRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  diffRowAdd: {
    backgroundColor: '#ecfdf3',
  },
  diffRowRemove: {
    backgroundColor: '#fff1f0',
  },
  diffSign: {
    width: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#8f959e',
  },
  diffSignAdd: {
    color: '#059669',
  },
  diffSignRemove: {
    color: '#dc2626',
  },
  diffLine: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#1f2329',
  },
});
