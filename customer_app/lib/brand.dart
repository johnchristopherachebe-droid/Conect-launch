import 'package:flutter/material.dart';

const conectPurple = Color(0xFF7C3AED);
const conectPurpleDark = Color(0xFF2A0F55);
const conectLavender = Color(0xFFEDE7FB);
const conectOrange = Color(0xFFFF7A00);
const conectCream = Color(0xFFF7F5FB);
const conectGreen = conectPurple; // old name kept so other screens still compile

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

/// The Cönëct logo mark: two interlocking C shapes, a location pin and speed lines.
class ConectBrandMark extends StatelessWidget {
  final double size;
  const ConectBrandMark({super.key, this.size = 84});

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size * 1.5,
        height: size * 1.05,
        child: CustomPaint(painter: _LogoPainter()),
      );
}

class _LogoPainter extends CustomPainter {
  static const double _tau = 6.283185307179586;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 200);
    const deep = Color(0xFF7C3AED);
    const mid = Color(0xFFA177FF);
    const light = Color(0xFFE4D9FF);

    Shader grad(Rect r, List<Color> c) =>
        LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: c).createShader(r);

    // Speed lines
    final bar = Paint()..color = mid;
    for (final b in const [
      [12.0, 52.0, 28.0],
      [6.0, 64.0, 34.0],
      [14.0, 76.0, 26.0],
      [20.0, 88.0, 20.0],
    ]) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(b[0], b[1], b[2], 6), const Radius.circular(3)), bar);
    }
    canvas.drawCircle(const Offset(4, 66), 3.5, Paint()..color = mid);
    canvas.drawCircle(const Offset(10, 96), 4, Paint()..color = deep);

    // Left C
    const lc = Offset(92, 78);
    canvas.drawArc(
      Rect.fromCircle(center: lc, radius: 38),
      0.7,
      _tau - 1.4,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 22
        ..strokeCap = StrokeCap.round
        ..shader = grad(Rect.fromCircle(center: lc, radius: 50), [deep, mid]),
    );

    // Right C
    const rc = Offset(134, 86);
    canvas.drawArc(
      Rect.fromCircle(center: rc, radius: 34),
      0.7,
      _tau - 1.4,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 20
        ..strokeCap = StrokeCap.round
        ..shader = grad(Rect.fromCircle(center: rc, radius: 46), [light, mid]),
    );

    // Diagonal ribbon linking the two Cs
    canvas.drawLine(
      const Offset(94, 100),
      const Offset(150, 52),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 16
        ..strokeCap = StrokeCap.round
        ..shader = grad(const Rect.fromLTWH(90, 48, 70, 56), [mid, light]),
    );

    // Location pin
    final head = Path()..addOval(Rect.fromCircle(center: const Offset(135, 20), radius: 10));
    final tail = Path()
      ..moveTo(126.5, 25)
      ..lineTo(135, 44)
      ..lineTo(143.5, 25)
      ..close();
    final pin = Path.combine(PathOperation.union, head, tail);
    final hole = Path()..addOval(Rect.fromCircle(center: const Offset(135, 20), radius: 4));
    canvas.drawPath(Path.combine(PathOperation.difference, pin, hole), Paint()..color = deep);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// "cönëct" wordmark with the purple ö. Colours adapt to light/dark unless onDark is set.
class ConectWordmark extends StatelessWidget {
  final double fontSize;
  final bool? onDark;
  const ConectWordmark({super.key, this.fontSize = 40, this.onDark});

  @override
  Widget build(BuildContext context) {
    final dark = onDark ?? Theme.of(context).brightness == Brightness.dark;
    final style = TextStyle(
      fontSize: fontSize,
      fontWeight: FontWeight.w800,
      letterSpacing: -.7,
      height: 1,
      color: dark ? Colors.white : conectPurpleDark,
    );
    return Text.rich(
      TextSpan(style: style, children: [
        const TextSpan(text: 'c'),
        TextSpan(text: 'ö', style: TextStyle(color: dark ? const Color(0xFFA78BFA) : conectPurple)),
        const TextSpan(text: 'nëct'),
      ]),
      textAlign: TextAlign.center,
    );
  }
}

class ConectSplash extends StatelessWidget {
  const ConectSplash({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          width: double.infinity,
          height: double.infinity,
          decoration: const BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF0B0615), Color(0xFF3B1480)]),
          ),
          child: const Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ConectBrandMark(size: 110),
              SizedBox(height: 18),
              ConectWordmark(fontSize: 42, onDark: true),
              SizedBox(height: 10),
              Text('Anything you need, anywhere you are.', style: TextStyle(color: Color(0xFFD9CCF5), fontSize: 15)),
              SizedBox(height: 28),
              SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
            ]),
          ),
        ),
      );
}
