# Cönëct Vendor app

Flutter vendor portal for registration, business profile submission, product management, store availability, and order viewing.

## Run

1. Install Flutter 3.19+ and Dart 3.3+.
2. From this directory run `flutter pub get`.
3. Run `flutter run --dart-define=API_URL=https://YOUR-API-HOST` (use `http://10.0.2.2:3000` for Android emulator against a local backend).
4. Create a vendor account, complete the business profile, then wait for admin review.

The app supports private uploads of government ID and (for food businesses) food-safety documents as JPG, PNG, or PDF files up to 2 MB. The backend encrypts files with `DOCUMENT_ENCRYPTION_KEY` before storing them. Configure and back up that key securely, review submitted files from the admin Documents tab, and do not approve a real vendor until documents and the required in-person orientation have been checked.


Store registration requires GPS coordinates. On Android, add `ACCESS_FINE_LOCATION` to the manifest; on iOS, add `NSLocationWhenInUseUsageDescription` to `Info.plist`. Keep location access enabled while capturing your store location.
