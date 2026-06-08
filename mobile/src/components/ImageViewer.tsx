/**
 * 全屏图片查看器
 * 支持：点击打开、捏合缩放、双指拖动、双击缩放、单击关闭
 */
import React, { useState, useRef } from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  StatusBar,
  Text,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import AuthImage from './AuthImage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImageViewerProps {
  visible: boolean;
  imageUrl: string;
  imageName?: string;
  onClose: () => void;
}

export default function ImageViewer({ visible, imageUrl, imageName, onClose }: ImageViewerProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // 图片进入动画
  const imageOpacity = useSharedValue(0);
  const imageScale = useSharedValue(0.92);

  React.useEffect(() => {
    if (visible) {
      imageOpacity.value = withTiming(1, { duration: 260 });
      imageScale.value = withTiming(1, { duration: 260 });
    } else {
      imageOpacity.value = 0;
      imageScale.value = 0.92;
    }
  }, [visible]);

  const [showInfo, setShowInfo] = useState(true);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToFit = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 200 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const showInfoTemporarily = () => {
    runOnJS(setShowInfo)(true);
    if (infoTimer.current) runOnJS(clearTimeout)(infoTimer.current);
    infoTimer.current = setTimeout(() => {
      runOnJS(setShowInfo)(false);
    }, 2500);
  };

  // 双击手势
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1.2) {
        resetToFit();
      } else {
        const targetScale = 2.5;
        const focusX = event.x - SCREEN_WIDTH / 2;
        const focusY = event.y - SCREEN_HEIGHT / 2;

        scale.value = withTiming(targetScale, { duration: 200 });
        savedScale.value = targetScale;
        translateX.value = withTiming(-focusX, { duration: 200 });
        translateY.value = withTiming(-focusY, { duration: 200 });
        savedTranslateX.value = -focusX;
        savedTranslateY.value = -focusY;
      }
    });

  // 单击关闭
  const singleTap = Gesture.Tap().onEnd(() => {
    runOnJS(onClose)();
  });

  // 捏合缩放
  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        resetToFit();
      } else if (scale.value > 5) {
        scale.value = withTiming(5, { duration: 150 });
        savedScale.value = 5;
      } else {
        savedScale.value = scale.value;
      }
      showInfoTemporarily();
    });

  // 双指拖动（缩放手势中附带）
  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // 组合手势：先识别双指（pinch+pan）还是单击/双击
  const composed = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    doubleTap,
    singleTap,
  );

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * imageScale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <GestureHandlerRootView style={styles.container}>
        {/* 纯黑遮罩 */}
        <View style={styles.backdrop} />

        {/* 关闭按钮 + 文件名 */}
        <Animated.View
          style={[
            styles.topBar,
            { opacity: showInfo ? 1 : 0 },
          ]}
          pointerEvents={showInfo ? 'auto' : 'none'}
        >
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
          {imageName ? (
            <Text style={styles.fileName} numberOfLines={1}>
              {imageName}
            </Text>
          ) : null}
          <TouchableOpacity onPress={resetToFit} style={styles.resetBtn}>
            <Ionicons name="scan-outline" size={20} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>

        {/* 图片主体 — 淡入 + 轻微缩放动画 */}
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.imageWrapper, imageAnimatedStyle]}>
            <AuthImage
              uri={imageUrl}
              style={styles.image}
              resizeMode="contain"
            />
          </Animated.View>
        </GestureDetector>

        {/* 底部提示 */}
        {showInfo && (
          <View style={styles.bottomHint}>
            <Text style={styles.hintText}>
              双击缩放 · 双指拖动 · 捏合放大
            </Text>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginHorizontal: 12,
  },
  resetBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  bottomHint: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 44 : 28,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
});
