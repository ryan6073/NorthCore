import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MessageAttachment } from '@/types';
import AuthImage from './AuthImage';
import { detectFileCategory, isImageAttachment, getFileIcon, getFileColor, formatFileSize, getFileTypeLabel } from '@/utils/fileType';
import type { FileTypeCategory } from '@/utils/fileType';

interface AttachmentCardProps {
  attachment: MessageAttachment;
  isUser?: boolean;
  onImagePress?: (url: string, name?: string) => void;
}

export default function AttachmentCard({ attachment, isUser = false, onImagePress }: AttachmentCardProps) {
  const [imageError, setImageError] = useState(false);
  const isImage = useMemo(() => isImageAttachment(attachment), [attachment]);
  const category: FileTypeCategory = useMemo(() => detectFileCategory(attachment), [attachment]);
  const sizeText = formatFileSize(attachment.size);

  if (isImage) {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (attachment.url && onImagePress) {
            onImagePress(attachment.url, attachment.name);
          }
        }}
        disabled={!attachment.url || !onImagePress}
      >
        <View style={[styles.imageCard, isUser ? styles.userCard : styles.agentCard]}>
          {!imageError && attachment.url ? (
            <AuthImage
              uri={attachment.url}
              style={styles.imagePreview}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.imageError}>
              <Ionicons name="image-outline" size={26} color="#94a3b8" />
              <Text style={styles.imageErrorText}>图片加载失败</Text>
            </View>
          )}

          <View style={styles.imageMeta}>
            <Text style={styles.imageName} numberOfLines={1}>
              {attachment.name || '图片附件'}
            </Text>
            {!!sizeText && <Text style={styles.imageSize}>{sizeText}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const fileColor = getFileColor(category);
  const fileIcon = getFileIcon(category);

  return (
    <TouchableOpacity
      style={[styles.fileCard, isUser ? styles.userCard : styles.agentCard]}
      activeOpacity={0.75}
    >
      <View style={[styles.fileIcon, { backgroundColor: fileColor + '16' }]}>
        <Ionicons name={fileIcon} size={18} color={fileColor} />
      </View>
      <View style={styles.fileInfo}>
        <View style={styles.fileNameRow}>
          <Text style={styles.fileName} numberOfLines={1}>
            {attachment.name || '附件'}
          </Text>
          <Text style={[styles.fileTypeBadge, { color: fileColor, backgroundColor: fileColor + '12' }]}>
            {getFileTypeLabel(category)}
          </Text>
        </View>
        {!!sizeText && <Text style={styles.fileSize}>{sizeText}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  imageCard: {
    width: 220,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8ecf3',
    backgroundColor: '#ffffff',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  imagePreview: {
    width: '100%',
    height: 150,
    backgroundColor: '#f8fafc',
  },
  imageError: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    gap: 6,
  },
  imageErrorText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  imageMeta: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  imageName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2329',
  },
  imageSize: {
    marginTop: 2,
    fontSize: 10,
    color: '#8f959e',
  },
  fileCard: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    backgroundColor: '#ffffff',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userCard: {
    alignSelf: 'flex-end',
  },
  agentCard: {
    alignSelf: 'flex-start',
  },
  fileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fileName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2329',
    flexShrink: 1,
  },
  fileTypeBadge: {
    fontSize: 8,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fileSize: {
    marginTop: 2,
    fontSize: 10,
    color: '#8f959e',
  },
});
