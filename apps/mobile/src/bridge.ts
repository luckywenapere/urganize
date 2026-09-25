// The shell's half of the bridge is defined in @urganize/native-bridge
// (createShellDispatcher) so it is covered by the same tests as the website's
// half. Re-exported here so App.tsx reads naturally.
export { createShellDispatcher as createNativeBridge } from '@urganize/native-bridge';
export type { BridgeHandlers } from '@urganize/native-bridge';
