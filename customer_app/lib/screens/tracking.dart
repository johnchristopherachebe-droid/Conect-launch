import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:latlong2/latlong.dart';
import '../api.dart';
import '../brand.dart';
import '../state.dart';
import 'live_map.dart';
import 'delivery_pin_card.dart';

const BoxDecoration _headerBg = BoxDecoration(
  gradient: LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B0615), Color(0xFF3B1480)],
  ),
);

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

  String get _shortId {
    final id = widget.orderId;
    return '#${(id.length > 8 ? id.substring(0, 8) : id).toUpperCase()}';
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
    return Scaffold(
      body: Container(
        decoration: _headerBg,
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 20, 20),
              child: Row(children: [
                IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                    onPressed: () => Navigator.pop(context)),
                const SizedBox(width: 4),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Track Order', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
                  Text('Order $_shortId', style: const TextStyle(color: Color(0xFFD9CCF5), fontSize: 13)),
                ]),
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
                child: o == null
                    ? Center(child: error == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(24), child: Text(error!)))
                    : _content(context, o),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _content(BuildContext context, Map<String, dynamic> o) {
    final cs = Theme.of(context).colorScheme;
    final status = o['status'] as String;
    final paid = o['paid'] == true;
    final cancelled = status == 'cancelled';
    final delivered = status == 'delivered';

    IconData icon;
    String title;
    if (cancelled) {
      icon = Icons.cancel_outlined;
      title = 'Order cancelled';
    } else if (!paid) {
      icon = Icons.payments_outlined;
      title = 'Waiting for payment';
    } else if (delivered) {
      icon = Icons.check_circle_rounded;
      title = 'Delivered!';
    } else if (status == 'picked_up') {
      icon = Icons.delivery_dining_rounded;
      title = 'Rider is on the way';
    } else if (status == 'ready') {
      icon = Icons.storefront_outlined;
      title = 'Ready for pickup';
    } else if (status == 'preparing') {
      icon = Icons.restaurant_rounded;
      title = 'Preparing your order';
    } else {
      icon = Icons.receipt_long_rounded;
      title = 'Order received';
    }
    final sub = cancelled
        ? '${o['store_name']} · this order was cancelled'
        : '${o['store_name']} · ₦${n(o['total']).toStringAsFixed(0)}';

    return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
      Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF7C3AED), Color(0xFF4C1D95)]),
        ),
        child: Row(children: [
          Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white24),
            child: Icon(icon, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(sub, style: const TextStyle(color: Color(0xFFE4D9FF), fontSize: 13)),
            ]),
          ),
        ]),
      ),
      if ((o['refund_status'] ?? 'none') != 'none')
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text('Refund status: ${o['refund_status']}${o['refund_note'] != null ? ' · ${o['refund_note']}' : ''}',
              style: TextStyle(color: cs.secondary)),
        ),
      const SizedBox(height: 14),
      if (!cancelled && !paid) _payBanner(),
      if (!cancelled && !delivered && paid) DeliveryPinCard(orderId: widget.orderId),
      if (!cancelled && paid) _timeline(status, cs),
      if (_courier(o) != null && !['delivered', 'cancelled'].contains(status))
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: ClipRRect(borderRadius: BorderRadius.circular(20), child: LiveMap(courier: _courier(o)!, destination: _dest(o))),
        ),
      const SizedBox(height: 14),
      _details(o),
      if (delivered && paid)
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: FilledButton.icon(onPressed: rateOrder, icon: const Icon(Icons.star_rounded), label: const Text('Rate your order')),
        ),
      if (status == 'placed')
        Padding(padding: const EdgeInsets.only(top: 16), child: OutlinedButton(onPressed: cancel, child: const Text('Cancel order'))),
      const SizedBox(height: 12),
      OutlinedButton(onPressed: () => Navigator.popUntil(context, (r) => r.isFirst), child: const Text('Back to Home')),
    ]);
  }

  Widget _timeline(String status, ColorScheme cs) {
    final labels = _steps.values.toList();
    final cur = _index(status);
    final rows = <Widget>[];
    for (var i = 0; i < labels.length; i++) {
      final state = cur > i ? 2 : cur == i ? 1 : 0;
      rows.add(_step(labels[i], state, cs));
      if (i < labels.length - 1) {
        rows.add(Padding(
          padding: const EdgeInsets.only(left: 11),
          child: Container(width: 2, height: 14, color: state == 2 ? cs.primary : cs.outlineVariant),
        ));
      }
    }
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: rows)));
  }

  Widget _details(Map<String, dynamic> o) {
    final items = (o['items'] as List).cast<Map<String, dynamic>>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Order details', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 10),
          for (final i in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Expanded(child: Text('${i['quantity']} × ${i['name']}')),
                Text('₦${(n(i['unit_price']) * (i['quantity'] as num)).toStringAsFixed(0)}'),
              ]),
            ),
          const Divider(height: 22),
          if (o['delivery_fee'] != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Delivery fee'),
                Text('₦${n(o['delivery_fee']).toStringAsFixed(0)}'),
              ]),
            ),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('Total', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            Text('₦${n(o['total']).toStringAsFixed(0)}',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: conectPurple)),
          ]),
        ]),
      ),
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
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Waiting for payment', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
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
  Widget _step(String label, int state, ColorScheme cs) => Row(children: [
        Icon(state == 2 ? Icons.check_circle : state == 1 ? Icons.radio_button_checked : Icons.radio_button_unchecked,
            size: 24, color: state == 0 ? cs.outline : cs.primary),
        const SizedBox(width: 14),
        Text(label, style: TextStyle(fontWeight: state == 1 ? FontWeight.w800 : null, color: state == 0 ? cs.outline : null)),
      ]);
}
