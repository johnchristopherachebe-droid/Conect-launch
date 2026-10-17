import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state.dart';

/// Phone number and delivery note the rider sees after accepting the order.
class DeliveryContactCard extends StatefulWidget {
  final TextEditingController phone;
  final TextEditingController note;
  const DeliveryContactCard({super.key, required this.phone, required this.note});
  @override
  State<DeliveryContactCard> createState() => _DeliveryContactCardState();
}

class _DeliveryContactCardState extends State<DeliveryContactCard> {
  @override
  void initState() {
    super.initState();
    _prefill();
  }

  Future<void> _prefill() async {
    if (widget.phone.text.isNotEmpty) return;
    try {
      final r = await context.read<AppState>().api.get('/me/phone');
      final p = (r['phone'] ?? '').toString();
      if (mounted && widget.phone.text.isEmpty && p.isNotEmpty) widget.phone.text = p;
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Delivery contact', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Your rider sees this after accepting your order.',
                style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
            const SizedBox(height: 12),
            TextField(
              controller: widget.phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                  labelText: 'Phone number', hintText: '+234 801 234 5678', prefixIcon: Icon(Icons.phone_outlined)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.note,
              maxLength: 300,
              minLines: 1,
              maxLines: 3,
              decoration: const InputDecoration(
                  labelText: 'Delivery note (optional)',
                  hintText: 'e.g. Blue gate, call when you arrive',
                  prefixIcon: Icon(Icons.sticky_note_2_outlined)),
            ),
          ]),
        ),
      );
}
