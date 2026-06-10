import { Artifact, ArtifactDetail, ArtifactVersion } from '@/types';
import { artifactApi } from '@/api/artifactApi';

export const getArtifacts = async (conversationId: string): Promise<Artifact[]> => {
  return await artifactApi.getArtifactMetaList(conversationId);
};

export const getArtifactDetail = async (artifactId: string): Promise<ArtifactDetail> => {
  return await artifactApi.getArtifactDetail(artifactId);
};

export const getArtifactVersions = async (artifactId: string): Promise<ArtifactVersion[]> => {
  return await artifactApi.getArtifactVersions(artifactId);
};
