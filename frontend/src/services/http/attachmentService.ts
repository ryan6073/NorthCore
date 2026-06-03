import http from '@/services/index';
import type {
  MessageAttachment,
  BaseApiResponse,
} from '@/types';

export interface BatchUploadResult {
  ok: boolean;
  attachment?: MessageAttachment;
  name?: string;
  error?: string;
}

export async function uploadAttachment(
  conversationId: string,
  file: File
): Promise<BaseApiResponse<{ attachment: MessageAttachment }>> {
  const formData = new FormData();
  formData.append('file', file);
  return await http.post(`/conversations/${conversationId}/attachments`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function uploadAttachmentBatch(
  conversationId: string,
  files: File[]
): Promise<BaseApiResponse<{ results: BatchUploadResult[] }>> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
    formData.append('files[]', file);
  });
  return await http.post(`/conversations/${conversationId}/attachments/batch`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

const attachmentService = {
  uploadAttachment,
  uploadAttachmentBatch,
};

export default attachmentService;
