import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { supabase } from '../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../lib/theme';
import type { UserRole } from '../../lib/types';

const roleOptions: { role: UserRole; title: string; blurb: string }[] = [
  {
    role: 'trainer',
    title: 'Trainer',
    blurb: 'Build programs, assign them to clients, and track their progress.',
  },
  {
    role: 'client',
    title: 'Client',
    blurb: 'Follow your trainer’s program and log your workouts.',
  },
];

export default function SignUpScreen() {
  const theme = useTheme();
  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSignUp() {
    if (!role) return;
    setError(null);
    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim(), role } },
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // With email confirmation enabled there is no session yet; otherwise the
    // root guard takes over and routes into the app.
    if (!data.session) setAwaitingConfirmation(true);
  }

  if (awaitingConfirmation) {
    return (
      <Screen>
        <View style={{ marginTop: 48, gap: 12 }}>
          <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
            Confirm your email
          </Text>
          <Text style={[typeScale.body, { color: theme.textSecondary }]}>
            We sent a confirmation link to {email.trim()}. Open it, then come back and sign in.
          </Text>
          <Button title="Back to sign in" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginTop: 48, marginBottom: 12, gap: 4 }}>
        <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>Create account</Text>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>
          Choose how you will use PTgo
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        {roleOptions.map((option) => {
          const selected = role === option.role;
          return (
            <Pressable
              key={option.role}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setRole(option.role)}
              style={{
                backgroundColor: selected ? theme.fillPrimary : theme.surface2,
                borderWidth: 1,
                borderColor: selected ? theme.fillPrimary : theme.border,
                borderRadius: radius.card,
                padding: 16,
                gap: 4,
              }}
            >
              <Text
                style={[
                  typeScale.cardTitle,
                  { color: selected ? theme.onFillPrimary : theme.textPrimary },
                ]}
              >
                {option.title}
              </Text>
              <Text
                style={[
                  typeScale.secondary,
                  { color: selected ? theme.onFillPrimary : theme.textSecondary },
                ]}
              >
                {option.blurb}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField label="Name" value={name} onChangeText={setName} placeholder="Your name" />
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
        autoComplete="new-password"
        placeholder="At least 6 characters"
      />

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: 8, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      <Button
        title="Create account"
        onPress={handleSignUp}
        loading={submitting}
        disabled={!role || !name.trim() || !email.trim() || password.length < 6}
      />

      <Link href="/" style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={[typeScale.body, { color: theme.accent.text }]}>
          Already have an account? Sign in
        </Text>
      </Link>
    </Screen>
  );
}
