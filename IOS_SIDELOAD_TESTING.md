# iOS device install

Open `ios/LociAR.xcodeproj` in Xcode.

- Bundle: `com.khankartal.lociar`
- Team: `ZSRUTGX74S`
- Destination: physical iPhone (ARKit)

Build and run. There is no Expo, Metro, or `.ipa` from EAS in this tree.

After changing `ios/project.yml`:

```bash
cd ios && xcodegen generate
```
