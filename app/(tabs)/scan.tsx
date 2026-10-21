import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';

import { useAuth } from '@/lib/auth';
import { registerAttendance } from '@/lib/attendance';
import { useRole } from '@/lib/role';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [importing, setImporting] = useState(false);
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();

  if (roleLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'student') {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.lockTitle}>Students Only</Text>
        <Text style={styles.lockText}>
          {role === 'teacher'
            ? 'Teacher accounts create events instead of scanning. Use the Events tab to generate a QR code.'
            : 'Admin accounts manage users and events instead of scanning. Use the Admin tab to view attendance.'}
        </Text>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera Permission Needed</Text>
        <Text style={styles.subtitle}>
          We need access to your camera to scan QR codes.
        </Text>
        <AppButton
          theme="primary"
          title="Grant Permission"
          icon="camera"
          onPress={requestPermission}
        />
      </View>
    );
  }

const handleBarcodeScanned = ({ data }: { data: string }) => {
  setScanned(true);
  setLastData(data);
  const studentId = user?.id ?? 'unknown';
  registerAttendance(data, studentId).then((result) => {
    setMessage(result.message);
    setSuccess(result.success);
  });
};

const handleScanAgain = () => {
  setScanned(false);
  setLastData(null);
  setMessage(null);
};

const handleImportImage = async () => {
  if (importing) return;
  setMessage(null);

  try {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.length) return;

    setImporting(true);
    const results = await scanFromURLAsync(picked.assets[0].uri, ['qr']);

    if (!results.length) {
      setScanned(true);
      setLastData(null);
      setSuccess(false);
      setMessage('No QR code found in that image. Try a clearer, closer picture.');
      return;
    }

    handleBarcodeScanned({ data: results[0].data });
  } catch {
    setScanned(true);
    setLastData(null);
    setSuccess(false);
    setMessage('Could not read that image. Please try another one.');
  } finally {
    setImporting(false);
  }
};

  const checking = scanned && !message;
  const frameColor = !scanned
    ? '#FFFFFF'
    : checking
    ? '#FFFFFF'
    : success
    ? '#4CAF50'
    : '#EF5350';

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      <View style={styles.mask} pointerEvents="none">
        <View style={styles.maskDim} />
        <View style={styles.maskMiddle}>
          <View style={styles.maskDim} />
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: frameColor }]} />
          </View>
          <View style={styles.maskDim} />
        </View>
        <View style={[styles.maskDim, styles.maskBottom]}>
          <Text style={styles.hint}>
            {checking
              ? 'Checking...'
              : scanned
              ? ''
              : 'Align the QR code inside the frame'}
          </Text>
        </View>
      </View>

      {scanned ? (
        <View style={styles.resultCard}>
          {checking ? (
            <Text style={styles.resultText}>Checking...</Text>
          ) : (
            <>
              <View style={styles.resultRow}>
                <Ionicons
                  name={success ? 'checkmark-circle' : 'close-circle'}
                  size={28}
                  color={success ? '#2E7D32' : '#C62828'}
                />
                <Text
                  style={[styles.resultText, success ? styles.success : styles.error]}
                >
                  {message}
                </Text>
              </View>
              <AppButton
                theme="primary"
                title="Scan Again"
                icon="refresh"
                onPress={handleScanAgain}
              />
            </>
          )}
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.galleryPill,
            pressed && styles.galleryPillPressed,
            importing && styles.galleryPillDisabled,
          ]}
          onPress={handleImportImage}
          disabled={importing}
        >
          <Ionicons name="image-outline" size={18} color="#FFFFFF" />
          <Text style={styles.galleryText}>
            {importing ? 'Reading image...' : 'Gallery'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const FRAME = 250;
const CORNER = 34;
const THICK = 5;
const DIM = 'rgba(0,0,0,0.55)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },

  /* Scan window */
  mask: { ...StyleSheet.absoluteFill },
  maskDim: { flex: 1, backgroundColor: DIM },
  maskMiddle: { flexDirection: 'row', height: FRAME },
  maskBottom: { alignItems: 'center', paddingTop: 18 },
  frame: { width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: 14,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: THICK, borderRightWidth: THICK, borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: THICK, borderLeftWidth: THICK, borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: THICK, borderRightWidth: THICK, borderBottomRightRadius: 14,
  },
  hint: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* Gallery button (small, floating) */
  galleryPill: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  galleryPillPressed: { opacity: 0.7 },
  galleryPillDisabled: { opacity: 0.5 },
  galleryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  /* Result card */
  resultCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  success: { color: '#2E7D32' },
  error: { color: '#C62828' },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  lockText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});