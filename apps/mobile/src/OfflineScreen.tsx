import { Pressable, StyleSheet, Text, View } from 'react-native';

// The app's dark ground and cream text, matching the splash, so an offline
// cold start reads as the app rather than as a broken web page. #0c0c0d since
// v1.157.7, the same near-black the site's dark theme paints (it was the old
// ink #0d120e, which made the launch screen a shade greener than the site's
// first frame: a visible second load screen). app.config.ts uses the same.
export const INK = '#0c0c0d';
const CREAM = '#f4eee2';
const SPRING = '#7fd99a';

export function OfflineScreen({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <View style={styles.root} accessibilityRole="alert">
      <Text style={styles.title}>You&apos;re offline</Text>
      <Text style={styles.body}>
        Urganize needs a connection to open. Check your data or Wi-Fi, then try again.
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, (pressed || retrying) && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{retrying ? 'Trying…' : 'Try again'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: CREAM, fontSize: 24, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  body: { color: CREAM, opacity: 0.75, fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  button: { backgroundColor: SPRING, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14 },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: INK, fontSize: 16, fontWeight: '600' },
});
