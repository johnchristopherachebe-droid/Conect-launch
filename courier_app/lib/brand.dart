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
          Positioned(top: size * .19, child: Icon(Icons.delivery_dining_rounded, size: size * .43, color: conectOrange)),
          Positioned(bottom: size * .08, child: Icon(Icons.shopping_cart_rounded, size: size * .29, color: conectCream)),
        ]),
      );
}
