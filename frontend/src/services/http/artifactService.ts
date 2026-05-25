import http from '@/services/index';
import type {
  Artifact,
  ArtifactVersion,
  ArtifactDetail,
  BaseApiResponse,
} from '@/types';

export async function getArtifactMetaList(
  conversationId: string
): Promise<BaseApiResponse<Artifact[]>> {
  return await http.get(`/conversations/${conversationId}/artifacts`);
}

export async function getArtifactDetail(
  artifactId: string
): Promise<BaseApiResponse<ArtifactDetail>> {
  return await http.get(`/artifacts/${artifactId}`);
}

export async function getArtifactVersions(
  artifactId: string
): Promise<BaseApiResponse<ArtifactVersion[]>> {
  return await http.get(`/artifacts/${artifactId}/versions`);
}

export async function updateArtifactContent(
  artifactId: string,
  payload: { content: string; changeSummary?: string }
): Promise<BaseApiResponse<ArtifactDetail>> {
  return await http.put(`/artifacts/${artifactId}`, payload);
}

const artifactService = {
  getArtifactMetaList,
  getArtifactDetail,
  getArtifactVersions,
  updateArtifactContent,
};

export default artifactService;
