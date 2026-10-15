import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'state.dart';
import 'push.dart';
import 'screens/auth.dart';
import 'screens/home.dart';
import 'brand.dart';

void main() => runApp(ChangeNotifierProvider(create: (_) => AppState()..init(), child: const ConectApp()));

class ConectApp extends StatelessWidget {
  const ConectApp({super.key});

  @override
  Widget build(BuildContext context) {
    const brand = conectGreen;
    return MaterialApp(
      title: 'Cönëct',
      scaffoldMessengerKey: messengerKey,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: brand, secondary: conectOrange), useMaterial3: true),
      darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: brand, secondary: conectOrange, brightness: Brightness.dark), useMaterial3: true),
      home: Consumer<AppState>(builder: (_, s, __) {
        if (!s.ready) return const ConectSplash();
        return s.api.token == null ? const AuthScreen() : const HomeScreen();
      }),
    );
  }
}
