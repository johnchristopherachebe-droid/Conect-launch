import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:latlong2/latlong.dart';
import '../api.dart';
import '../state.dart';
import 'live_map.dart';

const _steps = {
  'placed': 'Order received',
  'preparing': 'Preparing your order',
  'ready': 'Ready for pickup',
  'picked_up': 'Courier on the way',
  'delivered': 'Delivered',
};

class TrackingScreen extends StatefulWidget {
  final String orderId;
  const TrackingScreen({super.key, required this.orderId});
  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  Map<String, dynamic>? order;
  Timer? timer;
  String? error;

  @override
  void initState() {
    super.initState();
    refresh();
    timer = Timer.periodic(const Duration(seconds: 4), (_) => refresh());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> refresh() async {
    try {
      final o = await context.read<AppState>().api.get('/orders/${widget.orderId}');
      if (!mounted) return;
      setState(() { order = Map<String, dynamic>.from(o); error = null; });
      if (['delivered', 'cancelled'].contains(o['status'])) timer?.cancel();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> cancel() async {
    try {
      await context.read<AppState>().api.post('/orders/${widget.orderId}/cancel');
      refresh();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = order;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Your order')),
      body: o == null
          ? Center(child: error == null ? const CircularProgressIndicator() : Text(error!))
          : ListView(padding: const EdgeInsets.all(20), children: [
              Text(o['store_name'], style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(o['status'] == 'cancelled' ? 'This order was cancelled' : 'Total ₦${n(o['total']).toStringAsFixed(0)}'),
              if ((o['refund_status'] ?? 'none') != 'none') Padding(padding: const EdgeInsets.only(top: 8), child: Text('Refund status: ${o['refund_status']}${o['refund_note'] != null ? ' · ${o['refund_note']}' : ''}', style: TextStyle(color: cs.secondary))),
              const SizedBox(height: 16),
              if (o['status'] != 'cancelled' && o['paid'] != true) _payBanner(),
              if (o['status'] != 'cancelled' && o['paid'] == true)
                for (final e in _steps.entries.toList().asMap().entries)
                  _step(e.value.value, _index(o['status']) > e.key ? 2 : _index(o['status']) == e.key ? 1 : 0, cs),
              if (_courier(o) != null && !['delivered', 'cancelled'].contains(o['status']))
                Padding(padding: const EdgeInsets.only(top: 12), child: LiveMap(courier: _courier(o)!, destination: _dest(o))),
              const SizedBox(height: 16),
              for (final i in (o['items'] as List)) Text('${i['quantity']} × ${i['name']}'),
              if (o['status'] == 'delivered' && o['paid'] == true)
                Padding(padding: const EdgeInsets.only(top: 20), child: OutlinedButton.icon(onPressed: rateOrder, icon: const Icon(Icons.star_outline), label: const Text('Rate your order'))),
              if (o['status'] == 'placed')
                Padding(padding: const EdgeInsets.only(top: 24), child: OutlinedButton(onPressed: cancel, child: const Text('Cancel order'))),
            ]),
    );
  }

  Future<void> rateOrder() async {
    int stars = 5;
    final comment = TextEditingController();
    try {
      final existing = await context.read<AppState>().api.get('/orders/${widget.orderId}/rating');
      if (existing is Map) { stars = (existing['stars'] as num?)?.toInt() ?? 5; comment.text = existing['comment']?.toString() ?? ''; }
    } catch (_) {}
    if (!mounted) return;
    final result = await showDialog<Map<String, dynamic>>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
      title: const Text('How was your order?'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) => IconButton(tooltip: '${i + 1} star${i == 0 ? '' : 's'}', onPressed: () => setDialogState(() => stars = i + 1), icon: Icon(i < stars ? Icons.star : Icons.star_border, color: Colors.amber, size: 30)))),
        TextField(controller: comment, maxLength: 1000, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Comment (optional)', border: OutlineInputBorder())),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(dialogContext, {'stars': stars, 'comment': comment.text.trim()}), child: const Text('Submit rating'))],
    )));
    if (result == null || !mounted) return;
    try {
      await context.read<AppState>().api.post('/orders/${widget.orderId}/rating', result);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thank you for rating your order.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { comment.dispose(); }
  }

  Widget _payBanner() => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Waiting for payment', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            const Text('A courier gets your order once payment is confirmed.'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () async {
                try {
                  await context.read<AppState>().startPayment(widget.orderId);
                } catch (e) {
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Pay now'),
            ),
          ]),
        ),
      );

  LatLng? _courier(Map<String, dynamic> o) {
    final c = o['courierLocation'];
    return c == null ? null : LatLng(n(c['lat']).toDouble(), n(c['lng']).toDouble());
  }

  LatLng? _dest(Map<String, dynamic> o) {
    final a = o['address'];
    if (a == null || a['lat'] == null || a['lng'] == null) return null;
    return LatLng(n(a['lat']).toDouble(), n(a['lng']).toDouble());
  }

  int _index(String status) => _steps.keys.toList().indexOf(status);

  /// state: 0 upcoming, 1 current, 2 done
  Widget _step(String label, int state, ColorScheme cs) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Icon(state == 2 ? Icons.check_circle : state == 1 ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: state == 0 ? cs.outline : cs.primary),
          const SizedBox(width: 14),
          Text(label, style: TextStyle(fontWeight: state == 1 ? FontWeight.w800 : null, color: state == 0 ? cs.outline : null)),
        ]),
      );
}
