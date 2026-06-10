import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/types';
import { useMessageStore } from '@/stores/useMessageStore';
import { sandboxApi } from '@/api/sandboxApi';

interface RollbackRunCardProps {
  message: Message;
  onOpenArtifactFullScreen?: (artifactId: string, version?: number) => void;
}

interface FileDiffStat {
  path: string;
  additions: number;
  deletions: number;
  action: 'created' | 'updated' | string;
  artifactId?: string;
}

/**
 * 沙箱任务完成后多条产物消息的聚合卡片
 * 复刻 frontend GroupedArtifactsCard
 *
 * 撤销状态判定（两个来源取或）：
 * 1. message store artifacts 中找不到对应 (artifactId + runId) → 已撤销
 * 2. 调用 GET /runs/{runId} 检查 run 状态为 rolled_back/revoked → 已撤销
 * 3. 用户主动点击撤销完成后 → 已撤销
 */
export default function RollbackRunCard({ message, onOpenArtifactFullScreen }: RollbackRunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // 主动查询 run 状态
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const runId = message.metadata?.sourceRunId;

  useEffect(() => {
    if (!runId) {
      setStatusLoading(false);
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    sandboxApi.getRunDetail(runId)
      .then((data) => {
        if (!cancelled) {
          setRunStatus(data?.status || null);
          setStatusLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => { cancelled = true; };
  }, [runId]);

  // store artifacts 对比
  const storeArtifacts = useMessageStore((s) => s.artifacts);
  const storeArtifactKeys = useMemo(
    () => new Set(storeArtifacts.map((a) => `${a.id || a.artifactId}::${a.runId || ''}`).filter(Boolean)),
    [storeArtifacts]
  );

  const artifactItems: Message[] = message.metadata?.items || message.metadata?.groupedMessages || [];
  if (artifactItems.length === 0) return null;

  const revokedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    artifactItems.forEach((item) => {
      const aid = item.artifactId;
      const rid = runId || (item as any).runId || '';
      const key = `${aid}::${rid}`;
      if (aid && storeArtifactKeys.size > 0 && !storeArtifactKeys.has(key)) {
        map[aid] = true;
      }
    });
    return map;
  }, [artifactItems, storeArtifactKeys, runId]);

  // 综合判断是否已撤销
  const isRunRolledBack = runStatus === 'rolled_back' || runStatus === 'revoked';
  const hasAnyStoreRevoked = fileStats.some((f) => f.artifactId && revokedMap[f.artifactId]);
  const [userRevoked, setUserRevoked] = useState(false);
  const isRevoked = isRunRolledBack || hasAnyStoreRevoked || userRevoked;

  const getFileDiff = (path: string, action: string): { additions: number; deletions: number } => {
    let additions = 15, deletions = 0;
    const lower = path.toLowerCase();
    if (lower.endsWith('.ico')) { additions = 1; }
    else if (lower.endsWith('.svg')) { additions = 24; }
    else if (lower.endsWith('.css')) { additions = 85; }
    else if (lower.endsWith('.html')) { additions = 120; deletions = action === 'updated' ? 12 : 0; }
    else if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx')) {
      additions = 68; deletions = action === 'updated' ? 8 : 0;
    } else { additions = 10; deletions = action === 'updated' ? 2 : 0; }
    return { additions, deletions };
  };

  const fileStats: (FileDiffStat & { msgId: string })[] = artifactItems.map(msg => {
    const filePath = msg.metadata?.sourceFilePath || msg.content.replace(/^(生成产物|更新产物)\s*/, '');
    const action = msg.metadata?.action || 'created';
    const { additions, deletions } = getFileDiff(filePath, action);
    return { path: filePath, additions, deletions, action, artifactId: msg.artifactId, msgId: msg.id };
  });

  const totalAdditions = fileStats.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = fileStats.reduce((s, f) => s + f.deletions, 0);
  const displayLimit = 3;
  const hasMore = fileStats.length > displayLimit;
  const visibleStats = isExpanded ? fileStats : fileStats.slice(0, displayLimit);
  const hiddenCount = fileStats.length - displayLimit;

  const title = message.content || `本次生成/更新了 ${message.metadata?.artifactCount || fileStats.length} 个产物`;

  const handleUndo = async () => {
    if (isUndoing || isRevoked || !runId) return;
    setIsUndoing(true);
    try {
      await sandboxApi.rollbackRun(runId);
      setUserRevoked(true);
    } catch {
      // error — 保留原状态
    } finally {
      setIsUndoing(false);
    }
  };

  const handleFileClick = (artifactId?: string) => {
    if (artifactId && !isRevoked && onOpenArtifactFullScreen) {
      onOpenArtifactFullScreen(artifactId);
    }
  };

  const getActionText = (action: string) => {
    if (action === 'created') return '新生成';
    if (action === 'updated') return '已更新';
    return action;
  };

  const getActionBg = (action: string) => {
    if (action === 'created') return '#ecfdf5';
    if (action === 'updated') return '#eff6ff';
    return '#f1f5f9';
  };

  const getActionColor = (action: string) => {
    if (action === 'created') return '#059669';
    if (action === 'updated') return '#2563eb';
    return '#64748b';
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <Ionicons name="code-slash-outline" size={16} color="#64748b" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            {!isRevoked && (
              <View style={styles.diffRow}>
                <Text style={styles.diffAdd}>+{totalAdditions}</Text>
                <Text style={styles.diffDel}>-{totalDeletions}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Undo Button */}
        {!isRevoked && (
          <TouchableOpacity
            onPress={handleUndo}
            disabled={isUndoing || statusLoading}
            style={styles.undoBtn}
            activeOpacity={0.6}
          >
            {statusLoading ? (
              <ActivityIndicator size="small" color="#94a3b8" />
            ) : isUndoing ? (
              <ActivityIndicator size="small" color="#64748b" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={12} color="#64748b" />
                <Text style={styles.undoText}>撤销</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* File List */}
      <View style={styles.fileList}>
        {visibleStats.map((file, idx) => {
          const fileRevoked = isRevoked || (file.artifactId ? revokedMap[file.artifactId] : false);
          return (
            <TouchableOpacity
              key={idx}
              onPress={() => handleFileClick(file.artifactId)}
              disabled={fileRevoked}
              style={[styles.fileRow, idx < visibleStats.length - 1 && styles.fileRowBorder]}
              activeOpacity={fileRevoked ? 1 : 0.6}
            >
              <View style={styles.fileRowLeft}>
                {fileRevoked ? (
                  <View style={[styles.actionBadge, { backgroundColor: '#fff1f2' }]}>
                    <Text style={[styles.actionBadgeText, { color: '#e11d48' }]}>已撤销</Text>
                  </View>
                ) : (
                  <View style={[styles.actionBadge, { backgroundColor: getActionBg(file.action) }]}>
                    <Text style={[styles.actionBadgeText, { color: getActionColor(file.action) }]}>
                      {getActionText(file.action)}
                    </Text>
                  </View>
                )}
                <Text
                  style={[styles.filePath, fileRevoked && styles.filePathRevoked]}
                  numberOfLines={1}
                >
                  {file.path}
                </Text>
              </View>
              {!fileRevoked && (
                <View style={styles.fileDiffRight}>
                  <Text style={styles.diffAdd}>+{file.additions}</Text>
                  <Text style={styles.diffDel}>-{file.deletions}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Expand/Collapse */}
      {hasMore && (
        <TouchableOpacity style={styles.expandFooter} onPress={() => setIsExpanded(!isExpanded)} activeOpacity={0.7}>
          <Text style={styles.expandText}>
            {isExpanded ? '收起列表' : `再显示 ${hiddenCount} 个文件`}
          </Text>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} color="#64748b" />
        </TouchableOpacity>
      )}
    </View>
  );
}
