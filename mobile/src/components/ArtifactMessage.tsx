import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message, Artifact, ArtifactVersion } from '@/types';
import { useMessageStore } from '@/stores/useMessageStore';
import ArtifactPreview from './ArtifactPreview';

interface ArtifactMessageProps {
  message: Message;
  onOpenFullScreen?: (artifact: Artifact, version?: ArtifactVersion) => void;
}

/**
 * 内嵌在聊天气泡中的产物消息卡片
 */
export default function ArtifactMessage({ message, onOpenFullScreen }: ArtifactMessageProps) {
  const artifacts = useMessageStore((state) => state.artifacts);
  const artifactVersions = useMessageStore((state) => state.artifactVersions);
  const loadArtifactContent = useMessageStore((state) => state.loadArtifactContent);

  // ── 查找匹配的 Artifact ──
  const artifact = useMemo(() => {
    if (!message.artifactId) return null;
    return (
      artifacts.find((a) => a.id === message.artifactId) ||
      artifacts.find((a) => a.artifactId === message.artifactId) ||
      null
    );
  }, [artifacts, message.artifactId]);

  const [loadingContent, setLoadingContent] = useState(false);

  // ── 如果还没加载版本内容，自动拉取 ──
  useEffect(() => {
    if (!artifact) return;
    const loaded = artifactVersions[artifact.id] || (artifact.artifactId ? artifactVersions[artifact.artifactId] : undefined);
    if (!loaded && !loadingContent) {
      setLoadingContent(true);
      loadArtifactContent(artifact.id).finally(() => setLoadingContent(false));
    }
  }, [artifact?.id, artifact?.artifactId]);

  // ── 获取当前版本 ──
  const currentVersion: ArtifactVersion | null = useMemo(() => {
    if (!artifact) return null;
    const versions = artifactVersions[artifact.id] || (artifact.artifactId ? artifactVersions[artifact.artifactId] : undefined);
    if (!versions || versions.length === 0) return null;
    // 优先使用 latestVersion 匹配
    const matched = versions.find((v) => v.version === artifact.latestVersion);
    return matched || versions[versions.length - 1];
  }, [artifactVersions, artifact]);

  // 获取类型图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'code':
        return 'code-slash';
      case 'html':
        return 'globe-outline';
      case 'markdown':
        return 'document-text';
      case 'mermaid':
        return 'git-network-outline';
      case 'image':
        return 'image-outline';
      case 'document':
        return 'document-text-outline';
      case 'ppt':
        return 'easel-outline';
      default:
        return 'document-text-outline';
    }
  };

  const filename = message.content.replace(/^生成产物\s*/, '') || artifact?.title || '产物文档';

  if (!artifact) {
    // 产物尚未同步
    return (
      <View style={styles.artifactContainer}>
        <View style={styles.artifactHeader}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text" size={18} color="#3370ff" />
          </View>
          <View style={styles.artifactHeaderMeta}>
            <Text style={styles.artifactTitle} numberOfLines={1}>{filename}</Text>
            <Text style={styles.artifactSubtitle}>智能产物 · 同步中...</Text>
          </View>
        </View>
        <View style={styles.artifactPreviewBox}>
          <Text style={styles.artifactPreviewText} numberOfLines={4}>
            {message.metadata?.summary || '该产物正在同步，请稍后查看。'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onOpenFullScreen?.(artifact, currentVersion || undefined)}
      style={styles.artifactContainer}
    >
      <View style={styles.artifactHeader}>
        <View style={styles.iconCircle}>
          <Ionicons name={getTypeIcon(artifact.type) as any} size={18} color="#3370ff" />
        </View>
        <View style={styles.artifactHeaderMeta}>
          <Text style={styles.artifactTitle} numberOfLines={1}>{artifact.title}</Text>
          <Text style={styles.artifactSubtitle}>
            {artifact.type.toUpperCase()} · v{artifact.latestVersion}
          </Text>
        </View>
        <View style={styles.openPill}>
          <Ionicons name="expand-outline" size={14} color="#3370ff" />
        </View>
      </View>

      <View style={styles.previewBox}>
        <ArtifactPreview
          artifact={artifact}
          version={currentVersion}
          loading={loadingContent && !currentVersion}
          maxHeight={160}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  artifactContainer: {
    backgroundColor: '#ffffff',
    borderColor: '#e6eaf2',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    width: '100%',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  artifactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#edf4ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d6e5ff',
  },
  artifactHeaderMeta: {
    flex: 1,
  },
  artifactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2329',
  },
  artifactSubtitle: {
    fontSize: 10,
    color: '#8f959e',
    marginTop: 1,
  },
  artifactPreviewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e6eaf2',
  },
  artifactPreviewText: {
    fontSize: 11,
    color: '#646a73',
    lineHeight: 15,
  },
  previewBox: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e6eaf2',
    minHeight: 88,
  },
  openPill: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#edf4ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
