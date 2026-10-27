import 'package:flutter/material.dart';
import 'brand.dart';
import 'orders.dart';
import 'widgets.dart';

/// Main tab: online switch, today's numbers, deliveries in progress and new offers.
class HomeTab extends StatelessWidget {
  final bool online;
  final ValueChanged<bool> onOnline;
  final List<Map<String, dynamic>> active, available;
  final int maxActive;
  final double todayEarnings;
  final String? error;
  final Future<void> Function() onRefresh;
  final void Function(Map<String, dynamic> order) onAdvance, onAccept;
  final void Function(String url) onOpen;

  const HomeTab({
    super.key,
    required this.online,
    required this.onOnline,
    required this.active,
    required this.available,
    required this.maxActive,
    required this.todayEarnings,
    required this.onRefresh,
    required this.onAdvance,
    required this.onAccept,
    required this.onOpen,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    final full = active.length >= maxActive;
    return GradientPage(
      title: online ? 'You’re online' : 'You’re offline',
      subtitle: online ? 'Nearby orders can be offered to you' : 'Go online to start receiving orders',
      actions: [
        Padding(padding: const EdgeInsets.only(right: 12), child: Switch(value: online, onChanged: onOnline)),
      ],
      header: Row(children: [
        Expanded(child: StatTile(icon: Icons.two_wheeler, value: '${active.length}/$maxActive', label: 'Carrying')),
        const SizedBox(width: 10),
        Expanded(child: StatTile(icon: Icons.notifications_active_outlined, value: '${available.length}', label: 'New offers')),
        const SizedBox(width: 10),
        Expanded(child: StatTile(icon: Icons.payments_outlined, value: naira(todayEarnings), label: 'Earned today')),
      ]),
      child: RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            SectionHeader('Your deliveries', trailing: Pill('${active.length} of $maxActive', full ? conectOrange : conectPurple)),
            if (active.isEmpty)
              const EmptyState(
                icon: Icons.inventory_2_outlined,
                title: 'Nothing in progress',
                message: 'Accept an order below and it will show up here.',
              ),
            for (var i = 0; i < active.length; i++)
              ActiveOrderCard(
                order: active[i],
                position: active.length > 1 ? i + 1 : null,
                onAdvance: () => onAdvance(active[i]),
                onOpen: onOpen,
              ),
            if (full)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('You’re carrying the most deliveries allowed. Finish one to accept another.',
                    style: TextStyle(color: Theme.of(context).hintColor)),
              ),
            SectionHeader('New offers', trailing: available.isEmpty ? null : Pill('${available.length}', conectOrange)),
            if (available.isEmpty)
              EmptyState(
                icon: online ? Icons.hourglass_bottom_rounded : Icons.wifi_tethering_off,
                title: online ? 'Waiting for orders' : 'You’re offline',
                message: online ? 'New orders appear here by themselves.' : 'Switch on “online” at the top to be offered orders.',
              ),
            for (final o in available) OfferCard(order: o, limitReached: full, onAccept: () => onAccept(o)),
          ],
        ),
      ),
    );
  }
}
