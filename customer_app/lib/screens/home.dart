import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import 'cart.dart';
import 'orders.dart';
import 'store.dart';
import 'support.dart';
import 'account.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const cats = {'All': null, 'Food': 'food', 'Groceries': 'groceries', 'Pharmacy': 'pharmacy', 'Courier': 'courier'};
  String cat = 'All', search = '';
  Position? currentPosition;
  bool locating = true;
  String? locationError;
  late Future<dynamic> stores;

  @override void initState() { super.initState(); stores = Future.value([]); locate(); }

  Future<dynamic> load() {
    final p = currentPosition;
    if (p == null) return Future.value([]);
    final qs = <String, String>{if (cats[cat] != null) 'category': cats[cat]!, if (search.isNotEmpty) 'search': search, 'lat': '${p.latitude}', 'lng': '${p.longitude}', 'radiusKm': '15'};
    return context.read<AppState>().api.get('/stores?${Uri(queryParameters: qs).query}');
  }

  Future<void> locate() async {
    setState(() { locating = true; locationError = null; });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) throw Exception('Allow location access to see stores near you.');
      final p = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() { currentPosition = p; locating = false; stores = load(); });
    } catch (_) {
      if (!mounted) return;
      setState(() { currentPosition = null; locationError = 'Cönëct needs your location to show nearby stores. Turn on location access and try again.'; locating = false; stores = Future.value([]); });
    }
  }

  void reload() => setState(() => stores = load());

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cönëct', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(tooltip: 'Refresh nearby stores', icon: const Icon(Icons.my_location), onPressed: locate),
          IconButton(tooltip: 'My orders', icon: const Icon(Icons.receipt_long),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersScreen()))),
          IconButton(tooltip: 'Help & support', icon: const Icon(Icons.support_agent),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SupportScreen()))),
          IconButton(tooltip: 'Account & privacy', icon: const Icon(Icons.manage_accounts_outlined),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen()))),
          IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: s.signOut),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: SearchBar(hintText: 'Search stores', leading: const Icon(Icons.search),
              onSubmitted: (v) { search = v.trim(); reload(); }),
        ),
        SizedBox(
          height: 48,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
            for (final c in cats.keys)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(label: Text(c), selected: cat == c, onSelected: (_) { cat = c; reload(); }),
              ),
          ]),
        ),
        Expanded(
          child: FutureBuilder(
            future: stores,
            builder: (_, snap) {
              if (locating || snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (locationError != null) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Text(locationError!, textAlign: TextAlign.center), const SizedBox(height: 12), FilledButton.icon(onPressed: locate, icon: const Icon(Icons.my_location), label: const Text('Enable location / retry'))])));
              if (snap.hasError) {
                final msg = snap.error is ApiException ? (snap.error as ApiException).message : 'Could not load stores';
                return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(msg), const SizedBox(height: 8), FilledButton(onPressed: reload, child: const Text('Try again')),
                ]));
              }
              final list = snap.data as List;
              if (list.isEmpty) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [const Text('No stores with a configured GPS location were found within 15 km. Try another search or refresh your location.', textAlign: TextAlign.center), const SizedBox(height: 12), OutlinedButton.icon(onPressed: locate, icon: const Icon(Icons.refresh), label: const Text('Refresh location'))])));
              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final st = list[i] as Map<String, dynamic>;
                  return Card(
                    child: ListTile(
                      leading: Text(st['emoji'] ?? '🏪', style: const TextStyle(fontSize: 32)),
                      title: Text(st['name'], style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${st['eta_minutes']} min · ${st['distance_km'] == null ? 'Nearby' : '${n(st['distance_km']).toStringAsFixed(1)} km away'} · Distance-based delivery${(st['rating_count'] as num? ?? 0) > 0 ? ' · ★ ${st['average_rating']} (${st['rating_count']})' : ''}'),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(storeId: st['id']))),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ]),
      bottomNavigationBar: s.count == 0 ? null : cartBar(context, s),
    );
  }
}

Widget cartBar(BuildContext context, AppState s) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton(
          style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen())),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('View cart (${s.count})'),
            Text('₦${s.subtotal.toStringAsFixed(0)}'),
          ]),
        ),
      ),
    );
