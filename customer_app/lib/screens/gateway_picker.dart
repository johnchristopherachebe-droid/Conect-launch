import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';

/// Returns the chosen gateway code, or null if the customer closed the sheet.
Future<String?> pickGateway(BuildContext context) async {
  final gateways = await context.read<AppState>().paymentGateways();
  if (gateways.isEmpty) {
    throw ApiException('No payment method is available right now. Please try again later.');
  }
  if (gateways.length == 1) return gateways.first['code'] as String;
  if (!context.mounted) return null;
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text('Choose how to pay', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        ),
        for (final g in gateways)
          ListTile(
            leading: const Icon(Icons.payments_outlined),
            title: Text(g['name'] as String),
            subtitle: Text(g['description'] as String),
            onTap: () => Navigator.pop(ctx, g['code'] as String),
          ),
        const SizedBox(height: 8),
      ]),
    ),
  );
}
