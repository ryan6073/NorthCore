import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/types';
import { sandboxApi } from '@/api/sandboxApi';

interface RollbackRunCardProps {
  message: Message;
  /** 可选：打开产物全屏预览 */
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
 * 复刻 frontend GroupedArtifactsCard，包含撤销按钮
 */
export default function RollbackRunCard({ message, onOpenArtifactFullScreen }: RollbackRunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoResult, setUndoResult] = useState<'idle' | 'done' | 'error'>('idle');

  const artifactItems: Message[] = message.metadata?.items || message.metadata?.groupedMessages || [];
  if (artifactItems.length === 0) return null;

  const getFileDiff = (path: string, action: string): { additions: number; deletions: number } => {
    let additions = 15, deletions = 0;
    const lower = path.toLowerCase();
    if (lower.endsWith('.ico')) { additions = 1; deletions = 0; }
    else if (lower.endsWith('.svg')) { additions = 24; deletions = 0; }
    else if (lower.endsWith('.css')) { additions = 85; deletions = 0; }
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
  const hasAnyRevoked = undoResult === 'done';

  const title = message.content || `本次生成/更新了 ${message.metadata?.artifactCount || fileStats.length} 个产物`;

  const handleUndo = async () => {
    if (isUndoing || undoResult === 'done') return;
    const runId = message.metadata?.sourceRunId;
    if (!runId) { setUndoResult('error'); return; }
    setIsUndoing(true);
    try {
      await sandboxApi.rollbackRun(runId);
      setUndoResult('done');
    } catch {
      setUndoResult('error');
    } finally {
      setIsUndoing(false);
    }
  };

  const handleFileClick = (artifactId?: string) => {
    if (artifactId && onOpenArtifactFullScreen) {
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
            <Ionicons name="code-slash-outline" size={18} color="#64748b" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <View style={styles.diffRow}>
              <Text style={styles.diffAdd}>+{totalAdditions}</Text>
              <Text style={styles.diffDel}>-{totalDeletions}</Text>
            </View>
          </View>
        </View>

        {/* Undo Button */}
        <TouchableOpacity
          onPress={handleUndo}
          disabled={isUndoing || undoResult === 'done'}
          style={styles.undoBtn}
          activeOpacity={0.6}
        >
          {isUndoing ? (
            <ActivityIndicator size="small" color="#94a3b8" />
          ) : (
            <>
              <Ionicons
                name="refresh-outline"
                size={13}
                color={undoResult === 'done' ? '#94a3b8' : '#64748b'}
                style={undoResult !== 'done' ? { transform: [{ scaleX: -1 }] } : undefined}
              />
              <Text style={[styles.undoText, undoResult === 'done' && styles.undoTextDone]}>
                {undoResult === 'done' ? '已撤销' : undoResult === 'error' ? '撤销失败' : '撤销'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* File List */}
      <View style={styles.fileList}>
        {visibleStats.map((file, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => !hasAnyRevoked && handleFileClick(file.artifactId)}
            disabled={hasAnyRevoked}
            style={[styles.fileRow, idx < visibleStats.length - 1 && styles.fileRowBorder]}
            activeOpacity={hasAnyRevoked ? 1 : 0.6}
          >
            <View style={styles.fileRowLeft}>
              {hasAnyRevoked ? (
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
                style={[styles.filePath, hasAnyRevoked && styles.filePathRevoked]}
                numberOfLines={1}
              >
                {file.path}
              </Text>
            </View>
            {!hasAnyRevoked && (
              <View style={styles.fileDiffRight}>
                <Text style={styles.diffAdd}>+{file.additions}</Text>
                <Text style={styles.diffDel}>-{file.deletions}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Expand/Collapse */}
      {hasMore && (
        <TouchableOpacity style={styles.expandFooter} onPress={() => setIsExpanded(!isExpanded)} activeOpacity={0.7}>
          <Text style={styles.expandText}>
            {isExpanded ? '收起列表' : `再显示 ${hiddenCount} 个文件`}
          </Text>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fcfcfd',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 4,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 16,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  diffAdd: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#059669',
  },
  diffDel: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#dc2626',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    marginLeft: 10,
  },
  undoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  undoTextDone: {
    color: '#94a3b8',
  },
  fileList: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  fileRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fileRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  actionBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  filePath: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#475569',
    flex: 1,
  },
  filePathRevoked: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  fileDiffRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  expandFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  expandText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
});
