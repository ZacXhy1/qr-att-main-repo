import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import PasswordInput from '@/components/PasswordInput';
import PasswordRequirements from '@/components/PasswordRequirements';
import { COLORS } from '@/constants/colors';
import { requestPasswordReset, resetPasswordWithCode } from '@/lib/auth';
import { PASSWORD_MAX_LENGTH, validateEmail, validatePassword } from '@/lib/validation';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setError(null);
    setInfo(null);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await requestPasswordReset(email.trim());
      if (err) {
        setError(err.message);
      } else {
        setStep('reset');
        setInfo(`We sent a code to ${email.trim()}.`);
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setInfo(null);

    if (!code.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }
    const passwordError = validatePassword(password, { email });
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await resetPasswordWithCode(email.trim(), code.trim(), password);
      if (err) {
        setError(err.message);
      } else {
        setStep('done');
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Header title="ZIB QR Attendance" />
            </View>

            <Text style={styles.title}>
              {step === 'done' ? 'Password Updated' : 'Forgot Password'}
            </Text>

            {step === 'email' && (
              <>
                <Text style={styles.subtitle}>
                  Enter your account email and we'll send you a code to reset your password.
                </Text>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@school.edu"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />
                {error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.actions}>
                  {loading ? (
                    <ActivityIndicator size="large" color={COLORS.primary} />
                  ) : (
                    <AppButton
                      theme="primary"
                      title="Send Code"
                      icon="mail-outline"
                      onPress={sendCode}
                    />
                  )}
                </View>
              </>
            )}

            {step === 'reset' && (
              <>
                <Text style={styles.subtitle}>
                  {info ?? 'Enter the code from your email and choose a new password.'}
                </Text>

                <Text style={styles.label}>Code</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Code from your email"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!loading}
                />

                <Text style={styles.label}>New Password</Text>
                <PasswordInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a strong password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  editable={!loading}
                />
                <PasswordRequirements password={password} context={{ email }} />

                <Text style={styles.label}>Confirm New Password</Text>
                <PasswordInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your new password"
                  editable={!loading}
                />

                {error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.actions}>
                  {loading ? (
                    <ActivityIndicator size="large" color={COLORS.primary} />
                  ) : (
                    <>
                      <AppButton
                        theme="primary"
                        title="Reset Password"
                        icon="key-outline"
                        onPress={resetPassword}
                      />
                      <AppButton
                        title="Resend Code"
                        icon="refresh-outline"
                        onPress={sendCode}
                      />
                    </>
                  )}
                </View>
              </>
            )}

            {step === 'done' && (
              <>
                <Text style={styles.subtitle}>
                  Your password was changed. Sign in with your new password.
                </Text>
                <AppButton
                  theme="primary"
                  title="Back to Sign In"
                  icon="log-in-outline"
                  onPress={() => router.replace('/login')}
                />
              </>
            )}

            {step !== 'done' && (
              <Link href="/login" style={styles.link}>
                Back to Sign In
              </Link>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  headerContainer: { alignItems: 'center', marginTop: 20, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 15, lineHeight: 21, color: COLORS.textSecondary, marginBottom: 24 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  error: { fontSize: 14, color: COLORS.danger, marginTop: 12, marginBottom: 4 },
  actions: { marginTop: 12, marginBottom: 12 },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 12,
  },
});
