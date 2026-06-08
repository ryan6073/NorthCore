import { Artifact, ArtifactDetail, ArtifactVersion } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { mockArtifactService } from '@/mock/mockService';
import { artifactApi } from '@/api/artifactApi';

export const getArtifacts = async (conversationId: string): Promise<Artifact[]> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockArtifactService.getArtifacts(conversationId);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  return await artifactApi.getArtifactMetaList(conversationId);
};

export const getArtifactDetail = async (artifactId: string): Promise<ArtifactDetail> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockArtifactService.getArtifactDetail(artifactId);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  return await artifactApi.getArtifactDetail(artifactId);
};

export const getArtifactVersions = async (artifactId: string): Promise<ArtifactVersion[]> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockArtifactService.getArtifactVersions(artifactId);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  return await artifactApi.getArtifactVersions(artifactId);
};
