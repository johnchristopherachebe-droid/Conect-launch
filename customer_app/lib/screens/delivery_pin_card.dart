import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../brand.dart';
import '../state.dart';

/// Shows the 4-digit PIN the customer gives the rider when the order arrives.
class DeliveryPinCard extends StatefulWidget {
  final String orderId;
  const DeliveryPinCard({super.key, required this.orderId});
  @override
  State<DeliveryPinCard> createState() => _DeliveryPinCardState();
}

class _DeliveryPinCardState extends State<DeliveryPinCard> {
  String? pin;
  bool failed = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final r = await context.read<AppState>().api.get('/orders/${widget.orderId}/pin');
      if (mounted) setState(() { pin = r['pin']?.toString(); failed = false; });
    } catch (_) {
      if (mounted) setState(() => failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (pin == null && !failed) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: conectLavender,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: conectPurple.withValues(alpha: .35)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Row(children: [
          Icon(Icons.lock_outline_rounded, color: conectPurple),
          SizedBox(width: 8),
          Text('Delivery PIN', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Color(0xFF2A0F55))),
        ]),
        const SizedBox(height: 12),
        if (pin == null)
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('Could not load your PIN.', style: TextStyle(color: Color(0xFF2A0F55))),
            TextButton(onPressed: load, child: const Text('Try again')),
          ])
        else
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (final d in pin!.split(''))
              Container(
                width: 52,
                height: 60,
                margin: const EdgeInsets.symmetric(horizontal: 5),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: conectPurple, width: 1.5),
                ),
                child: Text(d, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFF2A0F55))),
              ),
          ]),
        const SizedBox(height: 12),
        const Text(
          'Give this PIN to your rider only when your order arrives. They need it to complete the delivery.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12.5, color: Color(0xFF2A0F55)),
        ),
      ]),
    );
  }
}
