import React, { useState, useMemo } from 'react';
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
 * - 撤销状态通过 message store 中的 artifacts 判断（刷新后仍保持）
 * - 卡片最大宽度 380，避免过宽
 */
export default function RollbackRunCard({ message, onOpenArtifactFullScreen }: RollbackRunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoResult, setUndoResult] = useState<'idle' | 'done' | 'error'>('idle');

  // 从 store 获取当前会话产物，判断撤销状态（刷新后依旧有效）
  const storeArtifacts = useMessageStore((s) => s.artifacts);
  const storeArtifactKeys = useMemo(
    () => new Set(storeArtifacts.map((a) => `${a.id || a.artifactId}::${a.runId || ''}`).filter(Boolean)),
    [storeArtifacts]
  );

  const artifactItems: Message[] = message.metadata?.items || message.metadata?.groupedMessages || [];
  if (artifactItems.length === 0) return null;

  // 检查单个文件是否已被撤销
  const revokedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    artifactItems.forEach((item) => {
      const aid = item.artifactId;
      const runId = message.metadata?.sourceRunId || (item as any).runId || '';
      const key = `${aid}::${runId}`;
      if (aid && storeArtifactKeys.size > 0 && !storeArtifactKeys.has(key)) {
        map[aid] = true;
      }
    });
    return map;
  }, [artifactItems, storeArtifactKeys, message.metadata?.sourceRunId]);

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
  // store 中任何文件被撤销 → 整个卡片已撤销
  const hasAnyRevoked = fileStats.some((f) => f.artifactId && revokedMap[f.artifactId]);
  // 撤销操作成功也算已撤销
  const isRevoked = hasAnyRevoked || undoResult === 'done';

  const title = message.content || `本次生成/更新了 ${message.metadata?.artifactCount || fileStats.length} 个产物`;

  const handleUndo = async () => {
    if (isUndoing || isRevoked) return;
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
        <TouchableOpacity
          onPress={handleUndo}
          disabled={isUndoing || isRevoked}
          style={styles.undoBtn}
          activeOpacity={0.6}
        >
          {isUndoing ? (
            <ActivityIndicator size="small" color="#94a3b8" />
          ) : (
            <>
              <Ionicons
                name="refresh-outline"
                size={12}
                color={isRevoked ? '#94a3b8' : '#64748b'}
              />
              <Text style={[styles.undoText, isRevoked && styles.undoTextDone]}>
                {isRevoked ? '已撤销' : undoResult === 'error' ? '撤销失败' : '撤销'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* File List */}
      <View style={styles.fileList}>
        {visibleStats.map((file, idx) => {
          const fileRevoked = file.artifactId ? revokedMap[file.artifactId] : false;
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fcfcfd',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 4,
    maxWidth: 420,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 15,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  diffAdd: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#059669',
  },
  diffDel: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#dc2626',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    marginLeft: 8,
  },
  undoText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  undoTextDone: {
    color: '#94a3b8',
  },
  fileList: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  fileRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fileRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  actionBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  actionBadgeText: {
    fontSize: 8,
    fontWeight: '700',
  },
  filePath: {
    fontSize: 10,
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
    gap: 3,
    marginLeft: 6,
  },
  expandFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  expandText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
});
