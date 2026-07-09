import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { supabase } from '../../lib/supabase';
import { type as typeScale, useTheme } from '../../lib/theme';

export default function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) setError(signInError.message);
    // On success the root layout's guard switches to the (app) stack.
  }

  return (
    <Screen>
      <View style={{ marginTop: 48, marginBottom: 12, gap: 4 }}>
        <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>PTgo</Text>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>
          Sign in to your account
        </Text>
      </View>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="Your password"
      />

      {error && (
        <View
          style={{
            backgroundColor: theme.danger.bg,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      <Button
        title="Sign in"
        onPress={handleSignIn}
        loading={submitting}
        disabled={!email.trim() || !password}
      />

      <Link href="/sign-up" style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={[typeScale.body, { color: theme.accent.text }]}>
          New here? Create an account
        </Text>
      </Link>
    </Screen>
  );
}
