import http from '@/services/index';
import type {
  ArtifactMeta,
  ArtifactDetail,
  BaseApiResponse,
} from '@/types';

export async function getArtifactMetaList(
  conversationId: string
): Promise<BaseApiResponse<ArtifactMeta[]>> {
  return await http.get(`/conversations/${conversationId}/artifacts`);
}

export async function getArtifactDetail(
  artifactId: string
): Promise<BaseApiResponse<ArtifactDetail>> {
  return await http.get(`/artifacts/${artifactId}`);
}

export async function updateArtifactContent(
  artifactId: string,
  payload: { content: string }
): Promise<BaseApiResponse<ArtifactDetail>> {
  return await http.put(`/artifacts/${artifactId}`, payload);
}

const artifactService = {
  getArtifactMetaList,
  getArtifactDetail,
  updateArtifactContent,
};

export default artifactService;
