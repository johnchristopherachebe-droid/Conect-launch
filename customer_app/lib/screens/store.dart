import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../brand.dart';
import '../state.dart';
import 'home.dart' show cartBar;
import 'product_image.dart';
import 'store_image.dart';

const BoxDecoration _headerBg = BoxDecoration(
  gradient: LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B0615), Color(0xFF3B1480)],
  ),
);

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

  Widget _chip(IconData icon, String text, {Color color = const Color(0xFFD9CCF5)}) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(color: Color(0xFFE4D9FF), fontSize: 12.5)),
      ]);

  Widget _stepper(AppState s, Map<String, dynamic> p, int q) => Container(
        decoration: BoxDecoration(color: conectLavender, borderRadius: BorderRadius.circular(22)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Remove one',
              icon: const Icon(Icons.remove_rounded, color: conectPurple),
              onPressed: () => s.change(p, -1)),
          Text('$q', style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF2A0F55), fontSize: 16)),
          IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Add one',
              icon: const Icon(Icons.add_rounded, color: conectPurple),
              onPressed: () => s.change(p, 1)),
        ]),
      );

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
          return Scaffold(
              appBar: AppBar(),
              body: Center(child: Text(snap.error is ApiException ? snap.error.toString() : 'Could not load this store')));
        }
        final st = snap.data as Map<String, dynamic>;
        final products = (st['products'] as List).cast<Map<String, dynamic>>();
        final num ratings = (st['rating_count'] as num?) ?? 0;
        return Scaffold(
          body: Container(
            decoration: _headerBg,
            child: Column(children: [
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 20, 20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                        onPressed: () => Navigator.pop(context)),
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Row(children: [
                      StoreImage(storeId: st['id'], emoji: st['emoji'] ?? '🏪', size: 68, radius: 20),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(st['name'],
                                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 6),
                            Wrap(spacing: 14, runSpacing: 4, children: [
                              _chip(Icons.star_rounded, ratings > 0 ? '${st['average_rating']} (${ratings.toInt()})' : 'New',
                                  color: conectOrange),
                              _chip(Icons.schedule_rounded, '${st['eta_minutes']} min'),
                              _chip(Icons.delivery_dining_rounded, 'Distance-based delivery'),
                            ]),
                          ]),
                        ),
                      ]),
                    ),
                  ]),
                ),
              ),
              Expanded(
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Theme.of(context).scaffoldBackgroundColor,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                      children: [
                        const Text('Menu', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 12),
                        if (products.isEmpty)
                          const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No items available yet.'))),
                        for (final p in products) _productCard(context, s, st, p),
                      ],
                    ),
                  ),
                ),
              ),
            ]),
          ),
          bottomNavigationBar: s.count == 0 ? null : cartBar(context, s),
        );
      },
    );
  }

  Widget _productCard(BuildContext context, AppState s, Map<String, dynamic> st, Map<String, dynamic> p) {
    final q = s.qty(p['id']);
    final unavailable = p['available'] == false;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Row(children: [          ProductImage(productId: p['id'], size: 64),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 4),
              Text('₦${n(p['price']).toStringAsFixed(0)}',
                  style: const TextStyle(color: conectPurple, fontWeight: FontWeight.w800, fontSize: 15)),
            ]),
          ),
          if (unavailable)
            Text('Unavailable', style: TextStyle(color: Theme.of(context).hintColor))
          else if (q == 0)
            IconButton.filled(tooltip: 'Add', icon: const Icon(Icons.add_rounded), onPressed: () => add(st, p))
          else
            _stepper(s, p, q),
        ]),
      ),
    );
  }
}
