import { request } from './httpClient';

export const fileApi = {
  async uploadFile(fileUri: string): Promise<{ id: string; url: string; name: string }> {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: 'file',
      type: 'multipart/form-data',
    } as any);

    const res = await request<{ id: string; url: string; name: string }>('/api/files/upload', {
      method: 'POST',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
};
