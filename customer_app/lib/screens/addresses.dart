import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../brand.dart';
import '../state.dart';
import '../widgets.dart';

class AddressesScreen extends StatefulWidget {
  const AddressesScreen({super.key});
  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  late Future<dynamic> addresses = context.read<AppState>().api.get('/addresses');

  void _reload() => setState(() => addresses = context.read<AppState>().api.get('/addresses'));
  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _add() async {
    final label = TextEditingController(text: 'Home'), line = TextEditingController(), city = TextEditingController();
    double? lat, lng;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('New address'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: label, decoration: const InputDecoration(labelText: 'Label')),
          TextField(controller: line, decoration: const InputDecoration(labelText: 'Street and number')),
          TextField(controller: city, decoration: const InputDecoration(labelText: 'City')),
          StatefulBuilder(
            builder: (ctx, set) => TextButton.icon(
              icon: Icon(lat == null ? Icons.my_location : Icons.check_circle),
              label: Text(lat == null ? 'Use my current location' : 'Location saved'),
              onPressed: () async {
                try {
                  var perm = await Geolocator.checkPermission();
                  if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
                  if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return;
                  final p = await Geolocator.getCurrentPosition();
                  lat = p.latitude;
                  lng = p.longitude;
                  set(() {});
                } catch (_) {}
              },
            ),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save address')),
        ],
      ),
    );
    if (ok != true) return;
    if (line.text.trim().isEmpty || city.text.trim().isEmpty) return _toast('Enter your street address and city.');
    if (lat == null || lng == null) return _toast('Tap “Use my current location” before saving so delivery coverage can be checked.');
    try {
      await context.read<AppState>().api.post('/addresses',
          {'label': label.text.trim(), 'line1': line.text.trim(), 'city': city.text.trim(), 'lat': lat, 'lng': lng});
      _reload();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) => GradientPage(
        title: 'Addresses',
        subtitle: 'Where should we deliver?',
        bottomBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(onPressed: _add, icon: const Icon(Icons.add_location_alt_outlined), label: const Text('Add new address')),
          ),
        ),
        child: FutureBuilder(
          future: addresses,
          builder: (_, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snap.hasError) {
              return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('Could not load your addresses.'),
                  TextButton(onPressed: _reload, child: const Text('Try again')),
                ]),
              );
            }
            final list = (snap.data as List).cast<Map<String, dynamic>>();
            if (list.isEmpty) return const Center(child: Text('No saved addresses yet.'));
            return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
              for (final a in list)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(color: conectLavender, borderRadius: BorderRadius.circular(14)),
                        child: const Icon(Icons.location_on_rounded, color: conectPurple),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(a['label'], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                          Text('${a['line1']}, ${a['city']}'),
                          const SizedBox(height: 4),
                          Row(children: [
                            Icon(a['lat'] != null ? Icons.check_circle : Icons.error_outline,
                                size: 14, color: a['lat'] != null ? const Color(0xFF16A34A) : conectOrange),
                            const SizedBox(width: 4),
                            Text(a['lat'] != null ? 'GPS saved' : 'No GPS, can’t be used for delivery',
                                style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
                          ]),
                        ]),
                      ),
                    ]),
                  ),
                ),
            ]);
          },
        ),
      );
}
