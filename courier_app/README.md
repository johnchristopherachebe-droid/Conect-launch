# Cönëct courier app (Flutter)

Run the backend first, then:

    flutter create . --project-name conect_courier
    flutter pub get
    flutter run --dart-define=API_URL=http://10.0.2.2:3000

Sign up here with "Sign up as a courier" (customer accounts are rejected). After email verification, complete the courier profile and upload government ID plus driving licence and vehicle registration for motor vehicles. Files must be JPG, PNG, or PDF up to 2 MB. The backend encrypts them with `DOCUMENT_ENCRYPTION_KEY`. A new courier must wait for admin document review and in-person orientation approval before seeing or accepting delivery jobs.

## Location permission
Android: add to android/app/src/main/AndroidManifest.xml
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
and `android:usesCleartextTraffic="true"` on <application> while testing over http.

iOS: add NSLocationWhenInUseUsageDescription to ios/Runner/Info.plist.

Location is only sent while "Available for orders" is on or you have an active delivery. Turn it on to be offered nearby orders.

## Push notifications
Uses Firebase Cloud Messaging. Set up Firebase for this Flutter app by following Firebase's official Flutter
setup (adds `google-services.json` for Android and `GoogleService-Info.plist` for iOS), and give the backend its
service-account key (see the backend README). Android 13+ also needs
`<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` in the manifest.
iOS needs Push Notifications and Background Modes enabled in Xcode, and an APNs key uploaded to Firebase.

Until Firebase is set up the app works normally, just without notifications.
