import 'package:flutter/material.dart';
import 'brand.dart';

/// ₦1,250 (no decimals by default).
String naira(dynamic v, {int decimals = 0}) {
  final x = (v is num ? v : (num.tryParse('$v') ?? 0)).toDouble();
  final parts = x.abs().toStringAsFixed(decimals).split('.');
  final whole = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '${x < 0 ? '-' : ''}₦$whole${parts.length > 1 ? '.${parts[1]}' : ''}';
}

/// Google Maps directions link from coordinates, falling back to a typed address.
String? mapsUrl(dynamic lat, dynamic lng, String? address) {
  if (lat != null && lng != null) {
    return 'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving';
  }
  final a = (address ?? '').trim();
  if (a.isEmpty) return null;
  return 'https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(a)}&travelmode=driving';
}

class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;
  const Pill(this.text, this.color, {super.key, this.icon});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      );
}

/// Translucent stat box that sits on the purple header.
class StatTile extends StatelessWidget {
  final IconData icon;
  final String value, label;
  const StatTile({super.key, required this.icon, required this.value, required this.label});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: .12), borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: const Color(0xFFD9CCF5), size: 20),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
          ),
          Text(label, style: const TextStyle(color: Color(0xFFD9CCF5), fontSize: 12)),
        ]),
      );
}

/// Three-step progress bar: to the store → on the way → delivered.
class StageBar extends StatelessWidget {
  final int step; // 0, 1 or 2
  const StageBar({super.key, required this.step});
  static const labels = ['To the store', 'On the way', 'Delivered'];

  @override
  Widget build(BuildContext context) => Column(children: [
        Row(children: [
          for (var i = 0; i < 3; i++)
            Expanded(
              child: Container(
                height: 6,
                margin: EdgeInsets.only(right: i < 2 ? 4 : 0),
                decoration: BoxDecoration(
                  color: i <= step ? conectPurple : conectPurple.withValues(alpha: .15),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
        ]),
        const SizedBox(height: 6),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          for (var i = 0; i < 3; i++)
            Text(labels[i],
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: i == step ? FontWeight.w800 : FontWeight.w500,
                  color: i == step ? conectPurple : Theme.of(context).hintColor,
                )),
        ]),
      ]);
}

/// Pickup → drop-off with a connecting line, and an optional action on each stop.
class RouteTimeline extends StatelessWidget {
  final String pickup, dropoff;
  final Widget? pickupAction, dropoffAction;
  const RouteTimeline({super.key, required this.pickup, required this.dropoff, this.pickupAction, this.dropoffAction});

  Widget _stop(BuildContext context, String label, String text, Widget? action) => Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
                style: const TextStyle(fontSize: 11, letterSpacing: 1.4, fontWeight: FontWeight.w800, color: conectPurple)),
            const SizedBox(height: 2),
            Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
          ]),
        ),
        if (action != null) action,
      ]);

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Column(children: [
            const SizedBox(height: 4),
            const Icon(Icons.circle, size: 12, color: conectPurple),
            Expanded(child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 4), color: Theme.of(context).dividerColor)),
            const Icon(Icons.location_on, size: 18, color: conectOrange),
          ]),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _stop(context, 'PICKUP', pickup, pickupAction),
              const SizedBox(height: 14),
              _stop(context, 'DROP-OFF', dropoff, dropoffAction),
            ]),
          ),
        ]),
      );
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, message;
  const EmptyState({super.key, required this.icon, required this.title, required this.message});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 24),
        child: Column(children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(color: conectLavender, shape: BoxShape.circle),
            child: Icon(icon, size: 30, color: conectPurple),
          ),
          const SizedBox(height: 14),
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
        ]),
      );
}

class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionHeader(this.title, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 18, 2, 8),
        child: Row(children: [
          Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          if (trailing != null) trailing!,
        ]),
      );
}
