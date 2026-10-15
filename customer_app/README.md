# Cönëct customer app (Flutter)

Talks to the `conect-backend` API.

## Run
    flutter create . --project-name conect_app   # generates android/ios folders once
    flutter pub get
    flutter run --dart-define=API_URL=http://10.0.2.2:3000   # Android emulator
    # iOS simulator: http://localhost:3000 · real phone: http://<your-computer-ip>:3000

Android needs `<uses-permission android:name="android.permission.INTERNET"/>` in the manifest
and `android:usesCleartextTraffic="true"` on `<application>` while testing over http.

## Live map
Tracking shows the courier (and the delivery address, if it has coordinates) on OpenStreetMap once a courier
is sharing location. Also add `ACCESS_FINE_LOCATION` to the Android manifest (and
`NSLocationWhenInUseUsageDescription` on iOS) for the "Use my current location" button on new addresses.

OpenStreetMap's free tile server is for light use. Before launch, switch the `TileLayer` URL in
`lib/screens/live_map.dart` to a paid tile provider (Mapbox, MapTiler, Google).

## Push notifications
Uses Firebase Cloud Messaging. Set up Firebase for this Flutter app by following Firebase's official Flutter
setup (adds `google-services.json` for Android and `GoogleService-Info.plist` for iOS), and give the backend its
service-account key (see the backend README). Android 13+ also needs
`<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` in the manifest.
iOS needs Push Notifications and Background Modes enabled in Xcode, and an APNs key uploaded to Firebase.

Until Firebase is set up the app works normally, just without notifications.
