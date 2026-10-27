import 'package:flutter/material.dart';
import 'api.dart' show n;
import 'brand.dart';
import 'widgets.dart';

/// A delivery the rider has accepted: progress, route, customer and the next action.
class ActiveOrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final int? position; // shown when the rider is carrying more than one delivery
  final VoidCallback onAdvance;
  final void Function(String url) onOpen;
  const ActiveOrderCard({super.key, required this.order, required this.onAdvance, required this.onOpen, this.position});

  @override
  Widget build(BuildContext context) {
    final o = order;
    final status = o['status'].toString();
    final pickedUp = status == 'picked_up';
    final store = o['store_name'].toString();
    final pickupAddr = (o['pickup_address'] ?? '').toString().trim();
    final name = (o['customer_name'] ?? 'Customer').toString();
    final phone = (o['customer_phone'] ?? '').toString().trim();
    final note = (o['delivery_note'] ?? '').toString().trim();
    final pickupUrl = mapsUrl(o['pickup_lat'], o['pickup_lng'], pickupAddr);
    final dropUrl = mapsUrl(o['dropoff_lat'], o['dropoff_lng'], '${o['line1']}, ${o['city']}');
    final hint = Theme.of(context).hintColor;

    Widget nav(String? url, String tip) => url == null
        ? const SizedBox.shrink()
        : IconButton.filledTonal(tooltip: tip, onPressed: () => onOpen(url), icon: const Icon(Icons.navigation_outlined));

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            if (position != null) ...[
              CircleAvatar(
                radius: 13,
                backgroundColor: conectPurple,
                child: Text('$position', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(child: Text(store, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            Pill(pickedUp ? 'In transit' : 'Collect', pickedUp ? conectOrange : conectPurple),
          ]),
          const SizedBox(height: 14),
          StageBar(step: pickedUp ? 1 : 0),
          const SizedBox(height: 16),
          RouteTimeline(
            pickup: pickupAddr.isEmpty ? store : pickupAddr,
            dropoff: '${o['label'] ?? 'Home'}: ${o['line1']}, ${o['city']}',
            pickupAction: pickedUp ? null : nav(pickupUrl, 'Navigate to the store'),
            dropoffAction: nav(dropUrl, 'Navigate to the customer'),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: conectLavender, borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.person_outline, size: 20, color: conectPurple),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF1B1030)))),
                if (phone.isNotEmpty)
                  FilledButton.tonalIcon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 38), padding: const EdgeInsets.symmetric(horizontal: 14)),
                    onPressed: () => onOpen('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}'),
                    icon: const Icon(Icons.call, size: 18),
                    label: const Text('Call'),
                  ),
              ]),
              if (phone.isEmpty)
                const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('No phone number given', style: TextStyle(fontSize: 13, color: Color(0xFF1B1030)))),
              if (note.isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.sticky_note_2_outlined, size: 18, color: conectPurple),
                  const SizedBox(width: 8),
                  Expanded(child: Text(note, style: const TextStyle(fontStyle: FontStyle.italic, color: Color(0xFF1B1030)))),
                ]),
              ],
            ]),
          ),
          if (pickedUp) ...[
            const SizedBox(height: 10),
            Row(children: [
              Icon(Icons.pin_outlined, size: 16, color: hint),
              const SizedBox(width: 6),
              Expanded(child: Text('Ask the customer for their 4-digit PIN when you hand over the order.', style: TextStyle(fontSize: 12, color: hint))),
            ]),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: onAdvance,
            icon: Icon(pickedUp ? Icons.verified_outlined : Icons.shopping_bag_outlined),
            label: Text(pickedUp ? 'Confirm delivery' : 'Mark as picked up'),
          ),
        ]),
      ),
    );
  }
}

/// An order being offered to the rider.
class OfferCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final bool limitReached;
  final VoidCallback onAccept;
  const OfferCard({super.key, required this.order, required this.limitReached, required this.onAccept});

  @override
  Widget build(BuildContext context) {
    final o = order;
    final store = o['store_name'].toString();
    final pickup = (o['pickup_address'] ?? '').toString().trim();
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(store, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(naira(n(o['delivery_fee'])),
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: conectOrange)),
              Text('delivery fee', style: TextStyle(fontSize: 11, color: Theme.of(context).hintColor)),
            ]),
          ]),
          const SizedBox(height: 14),
          RouteTimeline(pickup: pickup.isEmpty ? store : pickup, dropoff: '${o['line1']}, ${o['city']}'),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: limitReached ? null : onAccept,
            child: Text(limitReached ? 'Delivery limit reached' : 'Accept order'),
          ),
        ]),
      ),
    );
  }
}
