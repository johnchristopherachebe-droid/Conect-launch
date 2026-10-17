import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'state.dart';
import 'push.dart';
import 'screens/auth.dart';
import 'screens/home.dart';
import 'brand.dart';
import 'screens/onboarding.dart';

void main() => runApp(ChangeNotifierProvider(create: (_) => AppState()..init(), child: const ConectApp()));

class ConectApp extends StatelessWidget {
  const ConectApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cönëct',
      scaffoldMessengerKey: messengerKey,
      debugShowCheckedModeBanner: false,
      theme: conectTheme(Brightness.light),
      darkTheme: conectTheme(Brightness.dark),
      home: Consumer<AppState>(builder: (_, s, __) {
        if (!s.ready) return const ConectSplash();
        return s.api.token == null ? const FirstRunGate(child: AuthScreen()) : const HomeScreen();
      }),
    );
  }
}
