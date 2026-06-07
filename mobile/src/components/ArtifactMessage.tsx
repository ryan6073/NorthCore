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
    const loaded = artifactVersions[artifact.id];
    if (!loaded && !loadingContent) {
      setLoadingContent(true);
      loadArtifactContent(artifact.id).finally(() => setLoadingContent(false));
    }
  }, [artifact?.id]);

  // ── 获取当前版本 ──
  const currentVersion: ArtifactVersion | null = useMemo(() => {
    if (!artifact) return null;
    const versions = artifactVersions[artifact.id];
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
        <Ionicons name="expand-outline" size={16} color="#8f959e" />
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
    borderColor: '#dee0e3',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    width: '100%',
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
    backgroundColor: '#deebff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artifactHeaderMeta: {
    flex: 1,
  },
  artifactTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2329',
  },
  artifactSubtitle: {
    fontSize: 10,
    color: '#8f959e',
    marginTop: 1,
  },
  artifactPreviewBox: {
    backgroundColor: '#f5f6f7',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  artifactPreviewText: {
    fontSize: 11,
    color: '#646a73',
    lineHeight: 15,
  },
  previewBox: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#fafbfc',
    borderWidth: 1,
    borderColor: '#eff0f1',
  },
});
