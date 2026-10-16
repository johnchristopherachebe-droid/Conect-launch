import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../brand.dart';
import '../state.dart';
import '../widgets.dart';
import 'tracking.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late Future<dynamic> orders = context.read<AppState>().api.get('/orders');
  String filter = 'All';
  static const filters = ['All', 'Ongoing', 'Completed', 'Cancelled'];

  Future<void> _reload() async {
    setState(() => orders = context.read<AppState>().api.get('/orders'));
    try {
      await orders;
    } catch (_) {}
  }

  bool _matches(Map<String, dynamic> o) {
    final s = o['status'];
    switch (filter) {
      case 'Ongoing':
        return s != 'delivered' && s != 'cancelled';
      case 'Completed':
        return s == 'delivered';
      case 'Cancelled':
        return s == 'cancelled';
      default:
        return true;
    }
  }

  (String, Color) _badge(Map<String, dynamic> o) {
    final s = o['status'] as String;
    if (s == 'cancelled') return ('Cancelled', const Color(0xFFDC2626));
    if (o['paid'] == false) return ('Awaiting payment', conectOrange);
    switch (s) {
      case 'delivered':
        return ('Delivered', const Color(0xFF16A34A));
      case 'picked_up':
        return ('On the way', conectPurple);
      case 'ready':
        return ('Ready for pickup', conectPurple);
      case 'preparing':
        return ('Preparing', conectPurple);
      default:
        return ('Order received', conectPurple);
    }
  }

  String _short(String id) => '#${(id.length > 8 ? id.substring(0, 8) : id).toUpperCase()}';

  @override
  Widget build(BuildContext context) => GradientPage(
        title: 'My Orders',
        child: Column(children: [
          SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              children: [
                for (final f in filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(label: Text(f), selected: filter == f, onSelected: (_) => setState(() => filter = f)),
                  ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder(
              future: orders,
              builder: (_, snap) {
                if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snap.hasError) {
                  return Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(snap.error.toString()),
                      TextButton(onPressed: _reload, child: const Text('Try again')),
                    ]),
                  );
                }
                final all = (snap.data as List).cast<Map<String, dynamic>>();
                final list = all.where(_matches).toList();
                if (list.isEmpty) {
                  return Center(child: Text(all.isEmpty ? 'No orders yet. Your first one will show up here.' : 'No orders here.'));
                }
                return RefreshIndicator(
                  onRefresh: _reload,
                  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
                    for (final o in list) _card(context, o),
                  ]),
                );
              },
            ),
          ),
        ]),
      );

  Widget _card(BuildContext context, Map<String, dynamic> o) {
    final (label, color) = _badge(o);
    final created = o['created_at']?.toString();
    final date = created != null && created.length >= 10 ? created.substring(0, 10) : '';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: o['id'])))
            .then((_) {
          if (mounted) _reload();
        }),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: conectLavender, borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.receipt_long_rounded, color: conectPurple),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(o['store_name'], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 2),
                Text('${_short(o['id'].toString())}${date.isEmpty ? '' : ' · $date'}',
                    style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
                  child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ]),
            ),
            Text('₦${n(o['total']).toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          ]),
        ),
      ),
    );
  }
}
