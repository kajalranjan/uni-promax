import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { validateSignUp, type FieldErrors, type SignUpForm } from '@/lib/validation';
import { colors, spacing } from '@/theme';

const EMPTY: SignUpForm = { fullName: '', major: '', age: '', email: '', username: '', password: '' };

export default function SignUp() {
  const [form, setForm] = useState<SignUpForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<SignUpForm>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key: keyof SignUpForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function usernameTaken(username: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_username_available', { p_username: username });
    return !error && data === false;
  }

  // Check the username as soon as the student leaves the field.
  async function onUsernameBlur() {
    const u = form.username.trim();
    if (u.length >= 3 && !validateSignUp({ ...form, username: u }).username && (await usernameTaken(u))) {
      setErrors((e) => ({ ...e, username: 'That username is already taken' }));
    }
  }

  async function onSubmit() {
    setFormError('');
    setNotice('');
    const found = validateSignUp(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const username = form.username.trim();
    if (await usernameTaken(username)) {
      setErrors({ username: 'That username is already taken' });
      setLoading(false);
      return;
    }

    // The database creates the student's profile from this metadata.
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
          major: form.major.trim(),
          age: Number(form.age),
          username,
        },
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setErrors({ email: 'An account with this email already exists' });
      } else if (msg.includes('database error')) {
        // Most likely someone grabbed the username a moment ago.
        setErrors({ username: 'That username is already taken' });
      } else if (msg.includes('password')) {
        setErrors({ password: error.message });
      } else {
        setFormError(error.message);
      }
      setLoading(false);
      return;
    }

    if (!data.session) {
      // Email confirmation is turned on in Supabase: no session until they confirm.
      setNotice('Check your email to confirm your account, then log in.');
      setLoading(false);
    }
    // Otherwise they're logged in and the router moves to the homepage.
  }

  return (
    <FormScreen>
      <Text style={styles.heading}>Create your account</Text>
      <TextField label="Name" value={form.fullName} onChangeText={set('fullName')} error={errors.fullName}
        autoComplete="name" textContentType="name" autoCapitalize="words" />
      <TextField label="Major" value={form.major} onChangeText={set('major')} error={errors.major}
        autoCapitalize="words" />
      <TextField label="Age" value={form.age} onChangeText={set('age')} error={errors.age}
        keyboardType="number-pad" maxLength={3} />
      <TextField label="Email" value={form.email} onChangeText={set('email')} error={errors.email}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        autoComplete="email" textContentType="emailAddress" />
      <TextField label="Username" value={form.username} onChangeText={set('username')} error={errors.username}
        onBlur={onUsernameBlur} autoCapitalize="none" autoCorrect={false}
        autoComplete="username-new" textContentType="username" placeholder="At least 3 characters" />
      <TextField label="Password" value={form.password} onChangeText={set('password')} error={errors.password}
        secureTextEntry autoComplete="new-password" textContentType="newPassword"
        placeholder="At least 8 characters" returnKeyType="go" onSubmitEditing={onSubmit} />

      {!!formError && <Text style={styles.error}>{formError}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      <Button title="Sign up" onPress={onSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  error: { color: colors.error, fontSize: 15, marginBottom: spacing.sm },
  notice: { color: colors.text, fontSize: 15, marginBottom: spacing.sm },
});
