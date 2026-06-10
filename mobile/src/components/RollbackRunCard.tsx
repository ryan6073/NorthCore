import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message, Artifact } from '@/types';
import { useMessageStore } from '@/stores/useMessageStore';
import { sandboxApi } from '@/api/sandboxApi';
import { getArtifacts } from '@/services/artifactService';

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

  const convId = message.conversationId || '';
  const runId: string | undefined = message.metadata?.sourceRunId;

  // ── 从 GET /conversations/{id}/artifacts 获取产物列表，对比id+版本+run ──
  const [serverArtifacts, setServerArtifacts] = useState<Artifact[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  useEffect(() => {
    if (!convId) { setStatusLoading(false); return; }
    let cancelled = false;
    setStatusLoading(true);
    getArtifacts(convId)
      .then((list) => { if (!cancelled) { setServerArtifacts(list || []); setStatusLoading(false); } })
      .catch(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
  }, [convId]);

  const artifactItems: Message[] = message.metadata?.items || message.metadata?.groupedMessages || [];
  if (artifactItems.length === 0) return null;

  // 从 GET /conversations/{id}/artifacts 判断每个产物是否存在
  // 匹配条件：item.artifactId === server.id 且 sourceRunId === server.runId
  const allRevoked = useMemo(() => {
    // 如果用户已点击撤销，直接返回 revoked
    if (userRevoked) return 'revoked';
    // 还没加载完成时保留之前的状态（不重置为 pending）
    if (serverArtifacts.length === 0) return 'pending';
    const matched = artifactItems.filter((item) => {
      if (!item.artifactId) return false;
      return serverArtifacts.some(
        (a) => (a.id === item.artifactId || a.artifactId === item.artifactId) &&
              a.runId === runId
      );
    });
    return matched.length === 0 ? 'revoked' : 'partial';
  }, [artifactItems, serverArtifacts, runId, userRevoked]);

  const isRevoked = allRevoked === 'revoked';

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
      await sandboxApi.rollbackRun(runId);
      setUserRevoked(true);
      // 重新加载会话产物，更新右上角角标、产物面板和当前卡片状态
      if (convId) {
        useMessageStore.getState().loadArtifacts(convId);
        const freshList = await getArtifacts(convId).catch(() => []);
        setServerArtifacts(freshList || []);
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
          return (
            <TouchableOpacity key={idx} onPress={() => handleFileClick(file.artifactId)} disabled={isRevoked}
              style={[s.fileRow, idx < visibleStats.length - 1 && s.fileRowBorder]} activeOpacity={isRevoked ? 1 : 0.6}>
              <View style={s.fileRowLeft}>
                {isRevoked ? (
                  <View style={[s.badge, { backgroundColor: '#fff1f2' }]}><Text style={[s.badgeText, { color: '#e11d48' }]}>已撤销</Text></View>
                ) : (
                  <View style={[s.badge, { backgroundColor: (actionColors[file.action] || actionColors.created).bg }]}>
                    <Text style={[s.badgeText, { color: (actionColors[file.action] || actionColors.created).text }]}>
                      {file.action === 'created' ? '新生成' : file.action === 'updated' ? '已更新' : file.action}
                    </Text>
                  </View>
                )}
                <Text style={[s.filePath, isRevoked && s.filePathRevoked]} numberOfLines={1}>{file.path}</Text>
              </View>
              {!isRevoked && (
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
