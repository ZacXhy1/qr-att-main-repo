import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Dimensions,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type Props = {
  visible: boolean;
  payload: string | null;
  title?: string;
  code?: string;
  onClose: () => void;
};

export default function FullscreenQRModal({ visible, payload, title, code, onClose }: Props) {
  const { width, height } = Dimensions.get('window');
  const qrSize = Math.min(width, height) * 0.78;

  return (
    <Modal
      visible={visible && !!payload}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>

        {(title || code) && (
          <View style={styles.captionBox}>
            {title && <Text style={styles.title}>{title}</Text>}
            {code && <Text style={styles.code}>{code}</Text>}
          </View>
        )}

        {payload && (
          <View style={styles.qrBox}>
            <QRCode value={payload} size={qrSize} />
          </View>
        )}

        <Text style={styles.hint}>Tap anywhere to exit fullscreen</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 24,
    padding: 8,
    zIndex: 1,
  },
  captionBox: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  code: {
    fontSize: 14,
    color: '#CCCCCC',
    marginTop: 4,
    textAlign: 'center',
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
  },
  hint: {
    marginTop: 24,
    fontSize: 13,
    color: '#888888',
  },
});
