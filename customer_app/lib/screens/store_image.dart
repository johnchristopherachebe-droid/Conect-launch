import 'package:flutter/material.dart';
import '../api.dart';
import '../brand.dart';

/// Store photo from the server, or the store's emoji on a lavender tile when none was added.
class StoreImage extends StatelessWidget {
  final dynamic storeId;
  final String emoji;
  final double size;
  final double radius;
  const StoreImage({super.key, required this.storeId, required this.emoji, this.size = 64, this.radius = 16});

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: SizedBox(
          width: size,
          height: size,
          child: Image.network(
            '$apiUrl/stores/$storeId/image',
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              color: conectLavender,
              alignment: Alignment.center,
              child: Text(emoji, style: TextStyle(fontSize: size / 2)),
            ),
          ),
        ),
      );
}
