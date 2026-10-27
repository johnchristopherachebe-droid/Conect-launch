import 'package:flutter/material.dart';
import 'brand.dart';
import 'widgets.dart';

const _vehicles = {'bicycle': 'Bicycle', 'motorcycle': 'Motorcycle', 'car': 'Car', 'other': 'Other'};

/// Rider details, delivery rules and sign out.
class ProfileTab extends StatelessWidget {
  final Map<String, dynamic> profileData;
  final int maxActive;
  final VoidCallback onSignOut;
  const ProfileTab({super.key, required this.profileData, required this.maxActive, required this.onSignOut});

  Widget _row(IconData icon, String label, String value) => ListTile(
        leading: Icon(icon, color: conectPurple),
        title: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        subtitle: Text(value.isEmpty ? 'Not set' : value, style: const TextStyle(fontSize: 15)),
      );

  @override
  Widget build(BuildContext context) {
    final p = profileData['profile'] is Map ? profileData['profile'] as Map : const {};
    final phone = '${p['phone'] ?? ''}';
    final vehicle = _vehicles['${p['vehicle_type']}'] ?? '';
    final address = '${p['address'] ?? ''}';
    return GradientPage(
      title: 'Profile',
      subtitle: 'Your courier details',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(children: [
                const CircleAvatar(radius: 28, backgroundColor: conectLavender, child: Icon(Icons.two_wheeler, size: 28, color: conectPurple)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Cönëct courier', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    const Pill('Verified', Color(0xFF16A34A), icon: Icons.verified_outlined),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(children: [
              _row(Icons.phone_outlined, 'Phone', phone),
              const Divider(height: 1),
              _row(Icons.directions_bike_outlined, 'Vehicle', vehicle),
              const Divider(height: 1),
              _row(Icons.home_outlined, 'Home address', address),
            ]),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Delivery rules', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                _rule(Icons.layers_outlined, 'Carry up to $maxActive deliveries at the same time.'),
                _rule(Icons.pin_outlined, 'Always collect the customer’s 4-digit PIN before confirming a delivery.'),
                _rule(Icons.location_on_outlined, 'Your location is shared only while you are online or carrying an order.'),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(onPressed: onSignOut, icon: const Icon(Icons.logout), label: const Text('Sign out')),
        ],
      ),
    );
  }

  Widget _rule(IconData icon, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: conectPurple),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ]),
      );
}
