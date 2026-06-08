import { request } from './httpClient';
import { BaseApiResponse, MessageAttachment } from '@/types';

export interface BatchUploadResult {
  ok: boolean;
  attachment?: MessageAttachment;
  name?: string;
  error?: string;
}

export const attachmentApi = {
  async uploadAttachmentBatch(
    conversationId: string,
    files: Array<{ uri: string; name: string; type: string }>
  ): Promise<BaseApiResponse<{ results: BatchUploadResult[] }>> {
    const formData = new FormData();
    files.forEach((file) => {
      const fileData = {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any;
      formData.append('files', fileData);
      formData.append('files[]', fileData);
    });

    return await request<{ results: BatchUploadResult[] }>(
      `/conversations/${conversationId}/attachments/batch`,
      {
        method: 'POST',
        data: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
  },
};
