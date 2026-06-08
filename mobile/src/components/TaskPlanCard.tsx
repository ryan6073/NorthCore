/**
 * 执行规划卡片 — 1:1 复刻 frontend TaskPlanCard 设计
 *
 * 两种渲染模式：
 * 1. stepsData 模式（有后端结构化数据）：实时状态显示（pending / running / completed）
 * 2. 回退模式（纯文本解析）：显示为待办列表风格
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/types';

export interface TaskPlanStep {
  agentId: string;
  agentName: string;
  task: string;
  status?: 'pending' | 'running' | 'completed';
}

interface TaskPlanCardProps {
  content: string;
  stepsData?: TaskPlanStep[];
}

const INDIGO_50 = '#eef2ff';
const INDIGO_100 = '#dbeafe';
const INDIGO_200 = '#c7d2fe';
const INDIGO_400 = '#818cf8';
const INDIGO_500 = '#6366f1';
const INDIGO_600 = '#4f46e5';
const INDIGO_700 = '#4338ca';
const EMERALD_50 = '#ecfdf5';
const EMERALD_500 = '#10b981';
const EMERALD_700 = '#047857';
const SLATE_100 = '#f1f5f9';
const SLATE_200 = '#e2e8f0';
const TEXT_PRIMARY = '#1f2329';
const TEXT_SECONDARY = '#646a73';

function StepCircle({ idx, status }: { idx: number; status: 'pending' | 'running' | 'completed' }) {
  if (status === 'completed') {
    return (
      <View style={styles.stepCircleCompleted}>
        <Ionicons name="checkmark" size={12} color="#ffffff" style={{ fontWeight: '900' }} />
      </View>
    );
  }
  if (status === 'running') {
    return (
      <View style={styles.stepCircleRunning}>
        <Ionicons name="sync" size={12} color={INDIGO_600} />
      </View>
    );
  }
  return (
    <View style={styles.stepCirclePending}>
      <Text style={styles.stepCircleNumber}>{idx + 1}</Text>
    </View>
  );
}

export default function TaskPlanCard({ content, stepsData }: TaskPlanCardProps) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const title = lines[0]?.includes('任务拆解') ? lines[0] : '任务协同拆解计划';
  const hasStepsData = stepsData && stepsData.length > 0;
  const parsedSteps = useMemo(
    () => lines.filter(line => /^\d+\./.test(line.trim())),
    [lines],
  );

  const renderStep = (name: string, desc: string, idx: number, status: 'pending' | 'running' | 'completed', isLast: boolean) => (
    <View key={idx} style={styles.stepRow}>
      {/* 连接线 */}
      {!isLast && <View style={styles.stepConnector} />}

      {/* 步骤圆圈 */}
      <View style={styles.stepCircleWrapper}>
        <StepCircle idx={idx} status={status} />
      </View>

      {/* 内容 */}
      <View style={styles.stepContent}>
        <View style={styles.stepBadgeRow}>
          <View style={[
            styles.agentBadge,
            status === 'completed' ? styles.agentBadgeCompleted : styles.agentBadgePending,
          ]}>
            <Text style={[
              styles.agentBadgeText,
              status === 'completed' ? { color: EMERALD_700 } : { color: INDIGO_700 },
            ]}>
              {name}
            </Text>
          </View>
          {status === 'running' && (
            <View style={styles.runningLabel}>
              <Text style={styles.runningLabelText}>执行中...</Text>
            </View>
          )}
        </View>
        {desc ? (
          <Text style={styles.stepDesc} numberOfLines={0}>{desc}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBox}>
          <Ionicons name="list-outline" size={14} color={INDIGO_600} />
        </View>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {/* Steps */}
      <View style={styles.stepsContainer}>
        {hasStepsData ? (
          stepsData.map((step, idx) =>
            renderStep(
              step.agentName || 'Agent',
              step.task || '',
              idx,
              step.status || 'pending',
              idx === stepsData.length - 1,
            )
          )
        ) : parsedSteps.length > 0 ? (
          parsedSteps.map((step, idx) => {
            const cleanStep = step.replace(/^\d+\.\s*/, '');
            const parts = cleanStep.split(' - ');
            return renderStep(
              parts[0] || '',
              parts[1] || '',
              idx,
              'pending',
              idx === parsedSteps.length - 1,
            );
          })
        ) : (
          <Text style={styles.rawContent}>{content}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: SLATE_200,
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: SLATE_100,
  },
  headerIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: INDIGO_50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  stepsContainer: {
    gap: 12,
    paddingLeft: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    position: 'relative',
  },
  stepConnector: {
    position: 'absolute',
    left: 9.5,
    top: 20,
    bottom: -14,
    width: 1,
    backgroundColor: SLATE_200,
  },
  stepCircleWrapper: {
    zIndex: 10,
    flexShrink: 0,
  },
  stepCirclePending: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: INDIGO_200,
    backgroundColor: 'rgba(238, 242, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleRunning: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: INDIGO_400,
    backgroundColor: INDIGO_50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleCompleted: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: EMERALD_500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleNumber: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: INDIGO_600,
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  stepBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  agentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  agentBadgePending: {
    backgroundColor: 'rgba(238, 242, 255, 0.6)',
    borderColor: 'rgba(199, 210, 254, 0.1)',
  },
  agentBadgeCompleted: {
    backgroundColor: 'rgba(236, 253, 245, 0.6)',
    borderColor: 'rgba(167, 243, 208, 0.1)',
  },
  agentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  runningLabel: {
    //
  },
  runningLabelText: {
    fontSize: 10,
    color: INDIGO_500,
    fontWeight: '600',
  },
  stepDesc: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 17,
  },
  rawContent: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
});
