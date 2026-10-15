import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'auth.dart';
import 'jobs.dart';
import 'push.dart';
import 'brand.dart';

final api = Api();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final p = await SharedPreferences.getInstance();
  api.token = p.getString('token');
  runApp(const CourierApp());
}

class CourierApp extends StatefulWidget {
  const CourierApp({super.key});
  @override
  State<CourierApp> createState() => _CourierAppState();
}

class _CourierAppState extends State<CourierApp> {
  bool get signedIn => api.token != null;

  Future<void> signOut() async {
    await Push.stop(api);
    api.token = null;
    (await SharedPreferences.getInstance()).remove('token');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    const brand = conectGreen;
    return MaterialApp(
      title: 'Cönëct Courier',
      scaffoldMessengerKey: messengerKey,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: brand, secondary: conectOrange), useMaterial3: true),
      darkTheme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: brand, secondary: conectOrange, brightness: Brightness.dark), useMaterial3: true),
      home: signedIn ? JobsScreen(onSignOut: signOut) : AuthScreen(onDone: () => setState(() {})),
    );
  }
}
