import 'package:flutter/material.dart';

const conectGreen = Color(0xFF0B5D47);
const conectOrange = Color(0xFFFF7A00);
const conectCream = Color(0xFFFAF9F6);

class ConectBrandMark extends StatelessWidget {
  final double size;
  const ConectBrandMark({super.key, this.size = 84});

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: Stack(alignment: Alignment.center, children: [
          Icon(Icons.location_on_rounded, size: size, color: conectGreen),
          Positioned(
            top: size * .19,
            child: Icon(Icons.delivery_dining_rounded, size: size * .43, color: conectOrange),
          ),
          Positioned(
            bottom: size * .08,
            child: Icon(Icons.shopping_cart_rounded, size: size * .29, color: conectCream),
          ),
        ]),
      );
}

class ConectSplash extends StatelessWidget {
  const ConectSplash({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: conectCream,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ConectBrandMark(size: 104),
            SizedBox(height: 12),
            Text('cönëct', style: TextStyle(color: conectGreen, fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: -.7)),
            SizedBox(height: 8),
            Text('Order. Track. Receive.', style: TextStyle(color: conectGreen, fontSize: 15)),
            SizedBox(height: 28),
            SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: conectOrange)),
          ]),
        ),
      );
}
