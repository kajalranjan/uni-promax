import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { apiGet } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// Placeholder screen used only to confirm the setup works.
// It checks the connection to Supabase and to the FastAPI backend.
// Replace it with the real Welcome / Log in / Sign up screen.
type Status = 'checking' | 'ok' | string;

export default function Index() {
  const [db, setDb] = useState<Status>('checking');
  const [api, setApi] = useState<Status>('checking');

  useEffect(() => {
    supabase
      .from('interests')
      .select('id', { count: 'exact', head: true })
      .then(({ error }) => setDb(error ? `error: ${error.message}` : 'ok'));

    apiGet<{ status: string }>('/health')
      .then((r) => setApi(r.status === 'ok' ? 'ok' : JSON.stringify(r)))
      .catch((e: Error) => setApi(`error: ${e.message}`));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Uni Promax</Text>
      <Text style={styles.line}>Supabase: {db}</Text>
      <Text style={styles.line}>Backend: {api}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  line: { fontSize: 16 },
});
