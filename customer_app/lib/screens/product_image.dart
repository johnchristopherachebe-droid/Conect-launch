import 'package:flutter/material.dart';
import '../api.dart';
import '../brand.dart';

/// Product photo from the server, or a neutral placeholder when the vendor hasn't added one.
class ProductImage extends StatelessWidget {
  final dynamic productId;
  final double size;
  const ProductImage({super.key, required this.productId, this.size = 64});

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          width: size,
          height: size,
          child: Image.network(
            '$apiUrl/products/$productId/image',
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              color: conectLavender,
              child: Icon(Icons.restaurant_rounded, color: conectPurple.withValues(alpha: .6)),
            ),
          ),
        ),
      );
}
