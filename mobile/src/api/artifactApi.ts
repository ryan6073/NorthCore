import { request } from './httpClient';
import type { Artifact, ArtifactDetail, ArtifactVersion } from '@/types';

export const artifactApi = {
  /**
   * 获取会话的产物元数据列表
   */
  async getArtifactMetaList(conversationId: string): Promise<Artifact[]> {
    const res = await request<Artifact[]>(
      `/conversations/${conversationId}/artifacts`,
      { method: 'GET' }
    );
    return res.data;
  },

  /**
   * 获取产物详细信息（含 content）
   */
  async getArtifactDetail(artifactId: string): Promise<ArtifactDetail> {
    const res = await request<ArtifactDetail>(
      `/artifacts/${artifactId}`,
      { method: 'GET' }
    );
    return res.data;
  },

  /**
   * 获取产物的所有版本
   */
  async getArtifactVersions(artifactId: string): Promise<ArtifactVersion[]> {
    const res = await request<ArtifactVersion[]>(
      `/artifacts/${artifactId}/versions`,
      { method: 'GET' }
    );
    return res.data;
  },
};
