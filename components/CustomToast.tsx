import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type ToastType = 'success' | 'error' | 'info';

interface CustomToastProps {
  visible: boolean;
  message: string;
  type: ToastType;
  onHide: () => void;
  duration?: number;
}

export default function CustomToast({
  visible,
  message,
  type,
  onHide,
  duration = 2400,
}: CustomToastProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const timeout = setTimeout(onHide, duration);
    return () => clearTimeout(timeout);
  }, [duration, onHide, visible]);

  if (!visible || !message) {
    return null;
  }

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={[styles.toast, type === 'success' ? styles.success : type === 'error' ? styles.error : styles.info]}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  success: {
    backgroundColor: '#14532d',
    borderColor: '#22c55e',
  },
  error: {
    backgroundColor: '#7f1d1d',
    borderColor: '#f87171',
  },
  info: {
    backgroundColor: '#1e3a5f',
    borderColor: '#60a5fa',
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
