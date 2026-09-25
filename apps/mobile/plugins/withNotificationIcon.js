// Writes the Android notification icon and its tint colour into the generated
// project: @drawable/notification_icon and @color/notification_icon_color.
//
// Why a local plugin: @react-native-firebase/messaging's config plugin adds the
// manifest entries that POINT at those two resources, but never creates them —
// it expects expo-notifications to. This shell does not use expo-notifications
// (push goes through React Native Firebase, see src/push.ts), and pulling in a
// whole native module just for its icon copy would be weight for nothing.
// Without these resources the Android build fails on a missing resource.

const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidColors, withDangerousMod } = require('expo/config-plugins');

module.exports = function withNotificationIcon(config, { icon, color }) {
  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'notification_icon_color',
      value: color,
    });
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const source = path.resolve(cfg.modRequest.projectRoot, icon);
      const resDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      // The source is 96px, the xxxhdpi size for a 24dp icon, so it goes in
      // that bucket only and Android scales it down for lower densities.
      // Copying it into every bucket would be wrong, not just wasteful: a 96px
      // file in drawable-mdpi is read as a 96dp icon.
      const dir = path.join(resDir, 'drawable-xxxhdpi');
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(source, path.join(dir, 'notification_icon.png'));
      return cfg;
    },
  ]);
};
