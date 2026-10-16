import 'package:flutter/material.dart';

const conectPurple = Color(0xFF6D28D9);
const conectPurpleDark = Color(0xFF2A0F55);
const conectLavender = Color(0xFFEDE7FB);
const conectOrange = Color(0xFFFF7A00);
const conectCream = Color(0xFFF7F5FB); // page background
// Old names kept so existing screens keep working.
const conectGreen = conectPurple;

ThemeData conectTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final base = ColorScheme.fromSeed(seedColor: conectPurple, secondary: conectOrange, brightness: b);
  final scheme = base.copyWith(
    primary: dark ? const Color(0xFFA78BFA) : conectPurple,
    onPrimary: dark ? const Color(0xFF1B1030) : Colors.white,
  );
  final bg = dark ? const Color(0xFF110B1E) : conectCream;
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
  const size = Size(64, 52);
  const label = TextStyle(fontWeight: FontWeight.w700, fontSize: 16);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? bg : Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: dark ? Colors.white : const Color(0xFF1B1030)),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: size, shape: shape, textStyle: label)),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(minimumSize: size, shape: shape, textStyle: label)),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: size, shape: shape, textStyle: label)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF1C1430) : Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    cardTheme: CardThemeData(
      color: dark ? const Color(0xFF1C1430) : Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: dark ? const Color(0xFF2E2347) : const Color(0xFFEAE4F5)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorColor: dark ? const Color(0xFF3A2A66) : conectLavender,
    ),
  );
}

class ConectBrandMark extends StatelessWidget {
  final double size;
  final bool onDark;
  const ConectBrandMark({super.key, this.size = 84, this.onDark = false});

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: Stack(alignment: Alignment.center, children: [
          Icon(Icons.location_on_rounded, size: size, color: onDark ? Colors.white : conectPurple),
          Positioned(
            top: size * .19,
            child: Icon(Icons.delivery_dining_rounded, size: size * .43, color: onDark ? conectPurple : conectOrange),
          ),
          Positioned(
            bottom: size * .08,
            child: Icon(Icons.shopping_cart_rounded, size: size * .29, color: onDark ? conectPurple : conectCream),
          ),
        ]),
      );
}

class ConectSplash extends StatelessWidget {
  const ConectSplash({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          width: double.infinity,
          height: double.infinity,
          decoration: const BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [conectPurpleDark, conectPurple]),
          ),
          child: const Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ConectBrandMark(size: 104, onDark: true),
              SizedBox(height: 12),
              Text('cönëct', style: TextStyle(color: Colors.white, fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: -.7)),
              SizedBox(height: 8),
              Text('Anything you need, anywhere you are.', style: TextStyle(color: Color(0xFFD9CCF5), fontSize: 15)),
              SizedBox(height: 28),
              SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
            ]),
          ),
        ),
      );
}
