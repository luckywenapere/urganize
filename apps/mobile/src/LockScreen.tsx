import { Pressable, StyleSheet, Text, View } from 'react-native';

import { INK } from './OfflineScreen';

const CREAM = '#f4eee2';
const SPRING = '#7fd99a';

/**
 * Covers the whole app. Two looks:
 * - covered: the app is in the background (or just left it), so the page is
 *   hidden, which also hides it in the phone's app switcher. Nothing to tap.
 * - locked: waiting for the phone to say it is really them. A button asks again
 *   if they cancelled the first prompt.
 */
export function LockScreen({ locked, onUnlock }: { locked: boolean; onUnlock: () => void }) {
  return (
    <View style={styles.root} accessibilityViewIsModal importantForAccessibility="yes">
      <Text style={styles.brand}>Urganize</Text>
      {locked ? (
        <>
          <Text style={styles.title}>Locked</Text>
          <Text style={styles.body}>Use your phone to unlock Urganize.</Text>
          <Pressable
            onPress={onUnlock}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>Unlock</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  brand: { color: CREAM, fontSize: 28, fontWeight: '600', marginBottom: 24 },
  title: { color: CREAM, fontSize: 22, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  body: { color: CREAM, opacity: 0.75, fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  button: { backgroundColor: SPRING, borderRadius: 999, paddingHorizontal: 32, paddingVertical: 14 },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: INK, fontSize: 16, fontWeight: '600' },
});
