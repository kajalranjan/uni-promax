import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';
import { apiPost } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

type Tokens = { access_token: string; refresh_token: string };

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function onSubmit() {
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setLoading(true);
    try {
      // The backend finds the account for this username and checks the password.
      const tokens = await apiPost<Tokens>('/auth/login', { username: username.trim(), password });
      const { error: sessionError } = await supabase.auth.setSession(tokens);
      if (sessionError) throw sessionError;
      // Logged in: the router switches to the homepage automatically.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong, try again');
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Text style={styles.heading}>Welcome back</Text>
      <TextField
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title="Log in" onPress={onSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  error: { color: colors.error, fontSize: 15, marginBottom: spacing.sm },
});
