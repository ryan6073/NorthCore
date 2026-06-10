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

export default function RollbackRunCard({ message, onOpenArtifactFullScreen }: RollbackRunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [userRevoked, setUserRevoked] = useState(false);

  // ── 查询后端 run 状态 ──
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const runId: string | undefined = message.metadata?.sourceRunId;

  useEffect(() => {
    if (!runId) { setStatusLoading(false); return; }
    let cancelled = false;
    setStatusLoading(true);
    sandboxApi.getRunDetail(runId)
      .then((data) => { if (!cancelled) { setRunStatus(data?.status || null); setStatusLoading(false); } })
      .catch(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  const isRunRolledBack = runStatus === 'rolled_back' || runStatus === 'revoked';

  // ── store artifacts 对比 ──
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
      if (aid && storeArtifactKeys.size > 0 && !storeArtifactKeys.has(`${aid}::${rid}`)) {
        map[aid] = true;
      }
    });
    return map;
  }, [artifactItems, storeArtifactKeys, runId]);

  const hasAnyStoreRevoked = artifactItems.some((item) => item.artifactId && revokedMap[item.artifactId]);
  const isRevoked = isRunRolledBack || hasAnyStoreRevoked || userRevoked;

  // ── 文件统计 ──
  const getFileDiff = (path: string, action: string) => {
    let a = 15, d = 0;
    const lower = path.toLowerCase();
    if (lower.endsWith('.ico')) { a = 1; }
    else if (lower.endsWith('.svg')) { a = 24; }
    else if (lower.endsWith('.css')) { a = 85; }
    else if (lower.endsWith('.html')) { a = 120; d = action === 'updated' ? 12 : 0; }
    else if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx')) { a = 68; d = action === 'updated' ? 8 : 0; }
    else { a = 10; d = action === 'updated' ? 2 : 0; }
    return { additions: a, deletions: d };
  };

  const fileStats = artifactItems.map(msg => {
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
      const detail = await sandboxApi.rollbackRun(runId);
      setUserRevoked(true);
      // 从 store artifacts 中移除被撤销的产物，同步 header 角标
      const revokedIds = new Set(
        (detail?.changes || []).map((c: any) => c.artifactId).filter(Boolean)
      );
      if (revokedIds.size > 0) {
        useMessageStore.setState((state) => ({
          artifacts: state.artifacts.filter((a) => !revokedIds.has(a.id) && !revokedIds.has(a.artifactId)),
        }));
      }
    } catch {
      // error
    } finally {
      setIsUndoing(false);
    }
  };

  const handleFileClick = (artifactId?: string) => {
    if (artifactId && !isRevoked && onOpenArtifactFullScreen) {
      onOpenArtifactFullScreen(artifactId);
    }
  };

  const actionColors: Record<string, { bg: string; text: string }> = {
    created: { bg: '#ecfdf5', text: '#059669' },
    updated: { bg: '#eff6ff', text: '#2563eb' },
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.iconBox}>
            <Ionicons name="code-slash-outline" size={16} color="#64748b" />
          </View>
          <View style={s.headerText}>
            <Text style={s.title} numberOfLines={2}>{title}</Text>
            {!isRevoked && (
              <View style={s.diffRow}>
                <Text style={s.diffAdd}>+{totalAdditions}</Text>
                <Text style={s.diffDel}>-{totalDeletions}</Text>
              </View>
            )}
          </View>
        </View>
        {!isRevoked && (
          <TouchableOpacity onPress={handleUndo} disabled={isUndoing || statusLoading} style={s.undoBtn} activeOpacity={0.6}>
            {statusLoading || isUndoing
              ? <ActivityIndicator size="small" color="#94a3b8" />
              : <><Ionicons name="refresh-outline" size={12} color="#64748b" /><Text style={s.undoText}>撤销</Text></>}
          </TouchableOpacity>
        )}
      </View>

      <View style={s.fileList}>
        {visibleStats.map((file, idx) => {
          const fr = isRevoked || (file.artifactId ? revokedMap[file.artifactId] : false);
          return (
            <TouchableOpacity key={idx} onPress={() => handleFileClick(file.artifactId)} disabled={fr}
              style={[s.fileRow, idx < visibleStats.length - 1 && s.fileRowBorder]} activeOpacity={fr ? 1 : 0.6}>
              <View style={s.fileRowLeft}>
                {fr ? (
                  <View style={[s.badge, { backgroundColor: '#fff1f2' }]}><Text style={[s.badgeText, { color: '#e11d48' }]}>已撤销</Text></View>
                ) : (
                  <View style={[s.badge, { backgroundColor: (actionColors[file.action] || actionColors.created).bg }]}>
                    <Text style={[s.badgeText, { color: (actionColors[file.action] || actionColors.created).text }]}>
                      {file.action === 'created' ? '新生成' : file.action === 'updated' ? '已更新' : file.action}
                    </Text>
                  </View>
                )}
                <Text style={[s.filePath, fr && s.filePathRevoked]} numberOfLines={1}>{file.path}</Text>
              </View>
              {!fr && (
                <View style={s.fileDiffRight}>
                  <Text style={s.diffAdd}>+{file.additions}</Text>
                  <Text style={s.diffDel}>-{file.deletions}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {hasMore && (
        <TouchableOpacity style={s.expandFooter} onPress={() => setIsExpanded(!isExpanded)} activeOpacity={0.7}>
          <Text style={s.expandText}>{isExpanded ? '收起列表' : `再显示 ${hiddenCount} 个文件`}</Text>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} color="#64748b" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fcfcfd', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, overflow: 'hidden', marginVertical: 4, maxWidth: '100%', width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#ffffff' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  iconBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 11, fontWeight: '700', color: '#1e293b', lineHeight: 15 },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  diffAdd: { fontSize: 9, fontFamily: 'monospace', fontWeight: '700', color: '#059669' },
  diffDel: { fontSize: 9, fontFamily: 'monospace', fontWeight: '700', color: '#dc2626' },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f8fafc', marginLeft: 8 },
  undoText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  fileList: { backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingVertical: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  fileRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  fileRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  badge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 8, fontWeight: '700' },
  filePath: { fontSize: 10, fontFamily: 'monospace', color: '#475569', flex: 1 },
  filePathRevoked: { color: '#94a3b8', textDecorationLine: 'line-through' },
  fileDiffRight: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6 },
  expandFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#ffffff' },
  expandText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
});
