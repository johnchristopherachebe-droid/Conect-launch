import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import 'home.dart' show cartBar;

class StoreScreen extends StatefulWidget {
  final int storeId;
  const StoreScreen({super.key, required this.storeId});
  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  late final Future<dynamic> store = context.read<AppState>().api.get('/stores/${widget.storeId}');

  Future<void> add(Map<String, dynamic> st, Map<String, dynamic> p) async {
    final s = context.read<AppState>();
    if (!s.canAddFrom(st)) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Start a new cart?'),
          content: Text('Your cart has items from ${s.store!['name']}. Adding this clears it.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep cart')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Start new cart')),
          ],
        ),
      );
      if (ok != true) return;
    }
    s.startCartFor(st);
    s.change(p, 1);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return FutureBuilder(
      future: store,
      builder: (_, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snap.hasError) {
          return Scaffold(appBar: AppBar(), body: Center(child: Text(snap.error is ApiException ? snap.error.toString() : 'Could not load this store')));
        }
        final st = snap.data as Map<String, dynamic>;
        final products = (st['products'] as List).cast<Map<String, dynamic>>();
        return Scaffold(
          appBar: AppBar(title: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [Text('${st['emoji'] ?? ''} ${st['name']}'), if ((st['rating_count'] as num? ?? 0) > 0) Text('★ ${st['average_rating']} · ${st['rating_count']} ratings', style: Theme.of(context).textTheme.labelSmall)])),
          body: ListView.separated(
            itemCount: products.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final p = products[i];
              final q = s.qty(p['id']);
              return ListTile(
                title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('₦${n(p['price']).toStringAsFixed(0)}'),
                trailing: q == 0
                    ? FilledButton.tonal(onPressed: () => add(st, p), child: const Text('Add'))
                    : Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(tooltip: 'Remove one', icon: const Icon(Icons.remove_circle_outline), onPressed: () => s.change(p, -1)),
                        Text('$q', style: const TextStyle(fontWeight: FontWeight.w800)),
                        IconButton(tooltip: 'Add one', icon: const Icon(Icons.add_circle_outline), onPressed: () => s.change(p, 1)),
                      ]),
              );
            },
          ),
          bottomNavigationBar: s.count == 0 ? null : cartBar(context, s),
        );
      },
    );
  }
}
